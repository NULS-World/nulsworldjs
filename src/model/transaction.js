import {
  read_by_length, write_with_length,
  parse_varint, write_varint,
  address_from_hash,
  hash_twice,
  hash_from_address,
  readUint64, writeUint64,
  private_key_to_public_key
} from './data.js'

const secp256k1 = require('secp256k1')


const ADDRESS_LENGTH = 23
const HASH_LENGTH = 34
const PLACE_HOLDER = new Buffer.from([255, 255, 255, 255])
const MAX_COIN_SIZE = HASH_LENGTH + 2 + 8 + 6
const COIN_UNIT = 100000000
export const CHEAP_UNIT_FEE = 100000
//const CHEAP_UNIT_FEE = 110000
export const UNIT_FEE = 1000000
const KB = 1024

export class Coin {
  constructor () {
    this.address = null
    this.fromHash = null
    this.fromIndex = null
    this.na = null
    this.lockTime = null
  }

  parse (buf, cursor) {
    // Data is expected as a buffer object.
    let {len: pos, val: owner} = read_by_length(buf, cursor)
    cursor += pos
    if (owner.length > ADDRESS_LENGTH) {
      let val = (owner.length - HASH_LENGTH)
      if (val > 1) { throw 'Long int for index found' }
      // raise ValueError("Long int for index found")
      // Not supported
      this.fromHash = owner.slice(0, HASH_LENGTH - owner.length)
      this.fromIndex = owner[owner.length - 1]
    } else {
      this.address = owner
    }

    this.na = readUint64(buf, cursor)
    cursor += 8
    this.lockTime = buf.readIntLE(cursor, 6) // is it really LE ?
    cursor += 6
    return cursor
  }

  to_dict () {
    let val = {
      'value': this.na,
      'lockTime': this.lockTime
    }
    if (this.address !== null) {
      val['address'] = address_from_hash(this.address)
      val['addressHash'] = this.address.toString('hex') // no hex ?
    }

    if (this.fromHash !== null) {
      val['fromHash'] = this.fromHash.toString('hex')
      val['fromIndex'] = this.fromIndex
    }

    return val
  }

  static from_dict (value) {
    let item = new Coin()
    item.address = value.address || null
    item.fromHash = value.fromHash || null
    if (item.fromHash != null) { item.fromHash = new Buffer.from(item.fromHash, 'hex') }
    item.fromIndex = value.fromIndex || 0
    item.lockTime = value.lockTime || 0
    item.na = value.value || null
    item.na = Math.round(item.na)

    return item
  }

  serialize () {
    let output = new Buffer.alloc(MAX_COIN_SIZE)
    let cursor = 0
    if (this.fromHash != null) {
      cursor += write_with_length(Buffer.concat([this.fromHash, new Buffer([this.fromIndex])]), output, cursor)
      //cursor += Buffer.concat([new Buffer([this.fromHash.length + 1]), this.fromHash, new Buffer([this.fromIndex])]).copy(output, cursor)
    } else if (this.address != null) {
      cursor += write_with_length(this.address, output, 0)
    } else { throw 'Coin data should have either hash or address' }
    writeUint64(Math.round(this.na), output, cursor)
    cursor += 8
    // output += struct.pack("Q", self.na)
    if (this.lockTime !== 0) {
      output.writeIntLE(this.lockTime, cursor, 6) // is it really LE ?
    }
    cursor += 6

    // output += writeUint48(self.lockTime)
    output = output.slice(0, cursor)

    return output
  }
}

export class Transaction {
  constructor () {
    this.type = null
    this.time = null
    this.hash = null
    this.height = null
    this.scriptSig = null
    this.module_data = {}
    this.inputs = []
    this.outputs = []
  }

  _parse_data (buffer, cursor) {
    let md = this.module_data;
    if (this.type === 1) { // consensus reward
      cursor += PLACE_HOLDER.length
    } else if (this.type === 2) { // transfer
      cursor += PLACE_HOLDER.length
    } else if (this.type === 3) { // alias
      cursor += PLACE_HOLDER.length
      let {len: pos, val: address} = read_by_length(buffer, cursor)
      cursor += pos
      md['address'] = address_from_hash(address)
      let {len: pos2, val: alias} = read_by_length(buffer, cursor)
      cursor += pos
      md['alias'] = alias
    } else if (this.type === 4) { // register agent
      md['deposit'] = readUint64(buffer, cursor)
      cursor += 8
      md['agentAddress'] = buffer.slice(cursor, cursor + ADDRESS_LENGTH)
      cursor += ADDRESS_LENGTH
      md['agentAddress'] = address_from_hash(md['agentAddress'])
      md['packingAddress'] = buffer.slice(cursor, cursor + ADDRESS_LENGTH)
      cursor += ADDRESS_LENGTH
      md['packingAddress'] = address_from_hash(md['packingAddress'])
      md['rewardAddress'] = buffer.slice(cursor, cursor + ADDRESS_LENGTH)
      cursor += ADDRESS_LENGTH
      md['rewardAddress'] = address_from_hash(md['rewardAddress'])
      md['commissionRate'] = buffer.readDoubleLE(cursor) // LE ?
      cursor += 8
    } else if (this.type === 5) { // join consensus
      md['deposit'] = readUint64(buffer, cursor)
      cursor += 8
      md['address'] = buffer.slice(cursor, cursor + ADDRESS_LENGTH)
      cursor += ADDRESS_LENGTH
      md['address'] = address_from_hash(md['address'])
      md['agentHash'] = buffer.slice(cursor, cursor + HASH_LENGTH).toString('hex')
      cursor += HASH_LENGTH
    } else if (this.type === 6) { // cancel consensus
      md['joinTxHash'] = buffer.slice(cursor, cursor + HASH_LENGTH).toString('hex')
      cursor += HASH_LENGTH
    } else if (this.type === 9) { // cancel consensus
      md['createTxHash'] = buffer.slice(cursor, cursor + HASH_LENGTH).toString('hex')
      cursor += HASH_LENGTH
    } else if (this.type === 101) {
      md['sender'] = buffer.slice(cursor, cursor + ADDRESS_LENGTH)
      cursor += ADDRESS_LENGTH
      md['sender'] = address_from_hash(md['sender'])

      md['contractAddress'] = buffer.slice(cursor, cursor + ADDRESS_LENGTH)
      cursor += ADDRESS_LENGTH
      md['contractAddress'] = address_from_hash(md['contractAddress'])

      md['value'] = readUint64(buffer, cursor)
      cursor += 8
      md['gasLimit'] = readUint64(buffer, cursor)
      cursor += 8
      md['price'] = readUint64(buffer, cursor)
      cursor += 8

      let {len: pos, val: methodName} = read_by_length(buffer, cursor)
      cursor += pos
      md['methodName'] = methodName.toString('utf8')

      let {len: pos2, val: methodDesc} = read_by_length(buffer, cursor)
      cursor += pos2
      md['methodDesc'] = methodDesc.toString('utf8')

      let argslen = buffer[cursor]
      cursor += 1
      let args = []
      for (let i = 0; i <= argslen; i++) {
        let arglen = buffer[cursor]
        cursor += 1
        let arg = []
        for (let j = 0; j <= arglen; j++) {
          let {len: pos3, val: argcontent} = read_by_length(buffer, cursor)
          cursor += pos3
          arg.push(argcontent.toString('utf8'))
        }
        args.push(arg)
      }
      md['args'] = args

    } else {
      throw 'Not implemented'
    }

    return cursor
  }

  _write_data (buffer, cursor) {
    let md = this.module_data;
    if (this.type === 1) { // consensus reward
      PLACE_HOLDER.copy(buffer, cursor)
      cursor += PLACE_HOLDER.length
    } else if (this.type === 2) { // transfer
      PLACE_HOLDER.copy(buffer, cursor)
      cursor += PLACE_HOLDER.length
    } else if (this.type === 3) { // alias
      cursor += write_with_length(hash_from_address(md['address']), buffer, cursor)
      cursor += write_with_length(hash_from_address(md['alias']), buffer, cursor)
    } else if (this.type === 4) { // register agent
      writeUint64(md['deposit'], buffer, cursor)
      cursor += 8
      cursor += hash_from_address(md['agentAddress']).copy(buffer, cursor)
      cursor += hash_from_address(md['packingAddress']).copy(buffer, cursor)
      cursor += hash_from_address(md['rewardAddress']).copy(buffer, cursor)
      buffer.writeDoubleLE(md['commissionRate'], cursor)
      cursor += 8
    } else if (this.type === 5) { // join consensus
      writeUint64(md['deposit'], buffer, cursor)
      cursor += 8
      cursor += hash_from_address(md['address']).copy(buffer, cursor)
      cursor += Buffer.from(md['agentHash'], 'hex').copy(buffer, cursor)
    } else if (this.type === 6) { // cancel consensus
      cursor += Buffer.from(md['joinTxHash'], 'hex').copy(buffer, cursor)
    } else if (this.type === 9) { // stop agent
      cursor += Buffer.from(md['createTxHash'], 'hex').copy(buffer, cursor)
    } else if (this.type === 101) { // call contract
      cursor += hash_from_address(md['sender']).copy(buffer, cursor)
      cursor += hash_from_address(md['contractAddress']).copy(buffer, cursor)
      writeUint64(Math.round(md['value']), buffer, cursor)
      cursor += 8
      writeUint64(Math.round(md['gasLimit']), buffer, cursor)
      cursor += 8
      writeUint64(Math.round(md['price']), buffer, cursor)
      cursor += 8
      cursor += write_with_length(Buffer.from(md['methodName'], 'utf8'),
                                  buffer, cursor)
      cursor += write_with_length(Buffer.from(md['methodDesc'], 'utf8'),
                                  buffer, cursor)
      buffer[cursor] = md['args'].length
      cursor += 1
      for (let arg of md['args']) {
        buffer[cursor] = arg.length
        cursor += 1
        for (let argitem of arg) {
          cursor += write_with_length(Buffer.from(argitem, 'utf8'),
                                      buffer, cursor)
        }
      }
    } else {
      throw 'Not implemented'
    }

    return cursor
  }

  parse (buffer, cursor) {
    let st_cursor = cursor
    this.type = buffer.readUIntLE(buffer, cursor, 2)
    cursor += 2
    this.time = buffer.readUIntLE(buffer, cursor, 6)
    cursor += 6

    let st2_cursor = cursor

    let {len: pos, val: remark} = read_by_length(buffer, cursor)
    cursor += pos
    this.remark = remark

    cursor = this._parse_data(buffer, cursor)

    let {len: icpos, val: input_count} = parse_varint(buffer, cursor)
    cursor += icpos
    for (let i = 0; i < input_count; i++) {
      let coin = new Coin()
      cursor = coin.parse(buffer, cursor)
      this.inputs.push(coin)
    }

    let {len: ocpos, val: output_count} = parse_varint(buffer, cursor)
    cursor += ocpos
    for (let i = 0; i < output_count; i++) {
      let coin = new Coin()
      cursor = coin.parse(buffer, cursor)
      this.outputs.push(coin)
    }
    // this.coin_data = CoinData()
    // cursor = self.coin_data.parse(buffer, cursor)
    let med_cursor = cursor

    /* let values = bytes((self.type,)) \
               + bytes((255,)) + writeUint64(self.time) \
               + buffer.slice(st2_cursor, med_cursor) */

    // self.hash_bytes = hash_twice(values)
    // self.hash = NulsDigestData(data=self.hash_bytes, alg_type=0)

    let {len: scpos, val: ssig} = read_by_length(buffer, cursor)
    this.scriptSig = ssig
    cursor += scpos
    let end_cursor = cursor
    this.size = end_cursor - st_cursor

    return cursor
  }

  _write_coin_data (output, cursor) {
    cursor += write_varint(this.inputs.length, output, cursor)
    for (let cinput of this.inputs) {
      let serialized = cinput.serialize()
      serialized.copy(output, cursor)
      cursor += serialized.length
    }

    if (this.outputs.length > 0) {
      cursor += write_varint(this.outputs.length, output, cursor)
      for (let coutput of this.outputs) {
        cursor += coutput.serialize().copy(output, cursor)
      }
    }
    return cursor
  }

  serialize () {
    //let output = new Buffer.alloc(this.get_max_size()) // 1mb max size ?
    let output = Buffer.alloc(300000) // max size 300kb...
    let cursor = 0
    output.writeUIntLE(this.type, cursor, 2)
    cursor += 2
    output.writeUIntLE(this.time, cursor, 6)
    cursor += 6
    cursor += write_with_length(this.remark, output, cursor)
    cursor = this._write_data(output, cursor)

    cursor = this._write_coin_data(output, cursor)

    if (!(this.scriptSig === null)) {
      cursor += write_with_length(this.scriptSig, output, cursor)
    }

    output = output.slice(0, cursor)
    return output
  }

  static from_dict (value) {
    let item = new Transaction()
    item.type = value['type']
    item.time = value['time'] || null
    if (item.time === null) { item.time = (new Date().getTime()) }
    item.height = value.blockHeight || null
    item.remark = value.remark ? new Buffer.from(value.remark, 'utf8') : new Buffer([])
    item.scriptSig = new Buffer.from(value.scriptSig, 'hex') || new Buffer.from([])
    item.size = value.size || null
    item.module_data = value.info || {}

    for (let input of (value.inputs || [])) {
      item.inputs.push(Coin.from_dict(input))
    }

    for (let output of (value.outputs || [])) {
      item.outputs.push(Coin.from_dict(output))
    }

    return item
  }

  get_fee () {
    var initialValue = 0
    let inputs = this.inputs.reduce(function (accumulator, currentValue) {
        return accumulator + currentValue.na;
    }, initialValue)
    initialValue = 0
    let outputs = this.outputs.reduce(function (accumulator, currentValue) {
        return accumulator + currentValue.na;
    }, initialValue)
    return inputs - outputs
  }

  calculate_fee () {
    let max_size = this.get_max_size()
    let unit_fee = UNIT_FEE
    if ((this.type === 2) || (this.type === 101)){
      unit_fee = CHEAP_UNIT_FEE
    }

    let fee = unit_fee * Math.floor(max_size / KB) // per kb

    if (max_size % KB > 0) {
      // why is it needed, to be sure we have at least the fee ?
      // or am I doing a bad port from java, where they work with int and not mutable ?
      fee += unit_fee
    }

    return fee
  }

  get_max_size () {
    let data_size = 4
    if (this.type === 3) { // alias
      data_size = (ADDRESS_LENGTH * 2) + 2
    } else if (this.type === 4) { // register agent
      data_size = 8 + (ADDRESS_LENGTH * 3) + 8
    } else if (this.type === 5) { // join consensus
      data_size = 8 + ADDRESS_LENGTH + HASH_LENGTH
    } else if (this.type === 6) { // cancel consensus
      data_size = HASH_LENGTH
    } else if (this.type === 9) { // stop agent
      data_size = HASH_LENGTH
    } else if (this.type === 101) { // call contract
      data_size = ADDRESS_LENGTH + ADDRESS_LENGTH + 8 + 8 + 8 +
                  5 + this.module_data['methodName'].length +
                  5 + this.module_data['methodDesc'].length + 1
      for (let arg of this.module_data['args']) {
        data_size += 1
        for (let argitem of arg) {
          data_size += 5 + argitem.length
        }
      }
    }
    let size = 2 + 6 + 1 + this.remark.length + data_size +
              5 + (this.inputs.length * MAX_COIN_SIZE) +
              5 + (this.outputs.length * MAX_COIN_SIZE) +
              5 + this.scriptSig.length
    return size
  }

  get_digest (hash_varint=false) {
    let buf = Buffer.alloc(this.get_max_size())
    let cursor = 0
    if (hash_varint) {
      buf[0] = this.type
      buf[1] = 255
      cursor += 2

      writeUint64(Math.round(this.time), buf, cursor)
      cursor += 8
    } else {
      buf.writeUIntLE(this.type, cursor, 2)
      cursor += 2
      buf.writeUIntLE(this.time, cursor, 6)
      cursor += 6
    }

    cursor += write_with_length(this.remark, buf, cursor)
    cursor = this._write_data(buf, cursor)

    cursor = this._write_coin_data(buf, cursor)

    buf = buf.slice(0, cursor)

    let digest = hash_twice(buf)
    return digest
  }

  get_hash (hash_varint=false) {
    let digest = this.get_digest(hash_varint)
    let buf = Buffer.concat([Buffer.from([0, digest.length]), digest])
    return buf
  }

  sign (prv_key, hash_varint=false) {
    let digest = this.get_digest(hash_varint)

    let pub_key = private_key_to_public_key(prv_key)
    let pub_key2 = secp256k1.publicKeyCreate(prv_key)

    let sigObj = secp256k1.sign(digest, prv_key)
    let signed = secp256k1.signatureExport(sigObj.signature)

    let buf = Buffer.alloc(3 + pub_key.length + signed.length)
    let cursor = write_with_length(pub_key, buf, 0)
    cursor += 1 // we let a zero there for alg ECC type
    cursor += write_with_length(signed, buf, cursor)

    this.scriptSig = buf
  }

  to_dict () {
    let remark = ''
    if (this.remark) {
      try {
        remark = this.remark.toString('utf8')
      } catch (error) {
        console.exception(error)
        remark = this.remark.toString('base64')
      }
    }

    return {
      'hash': this.get_hash().toString('hex'),
      'type': this.type,
      'time': this.time,
      'blockHeight': this.height,
      'fee': (this.type !== 1) ? this.get_fee() : 0, // fix this
      'remark': remark,
      'scriptSig': this.scriptSig ? this.scriptSig.toString('hex') : null,
      'size': this.size,
      'info': this.module_data,
      'inputs': this.inputs.map((utxo) => utxo.to_dict()),
      'outputs': this.outputs.map((utxo) => utxo.to_dict())
    }
  }
}
 export default Transaction
