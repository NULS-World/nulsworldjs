import axios from 'axios'
import { hash_from_address } from '../model/data'
import {
  CHEAP_UNIT_FEE,
  Transaction, Coin} from '../model/transaction'
import {DEFAULT_SERVER} from './base'

export async function get_outputs (address,
                                   {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios.get(`${api_server}/addresses/outputs/${address}.json`)
  return response.data
}

export async function ipfs_push (value,
                                 {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios.post('${api_server}/ipfs/add_json', value)
  if (response.data.hash !== undefined) {
    return response.data.hash
  } else {
    return null
  }
}

export async function ipfs_push_file (fileobject,
                                      {api_server = DEFAULT_SERVER} = {}) {
  let formData = new FormData();
  formData.append('file', fileobject);

  let response = await axios.post( '${api_server}/ipfs/add_file',
    formData,
    {
      headers: {
          'Content-Type': 'multipart/form-data'
      }
    }
  )

  if (response.data.hash !== undefined) {
    return response.data.hash
  } else {
    return null
  }
}

export async function prepare_remark_tx (address, remark,
                                         {api_server = DEFAULT_SERVER} = {}) {
  let outputs_data = await get_outputs(address, {'api_server': api_server})

  let tx = Transaction.from_dict(
    {'inputs': [

    ],
    'outputs': [
      {address: hash_from_address(address),
        value: outputs_data.total_available}
    ],
    'type': 2,
    'scriptSig': '',
    'remark': remark
    }
  )

  let total_value = 0
  while (total_value < CHEAP_UNIT_FEE) {
    let utxo = outputs_data.outputs.shift()
    if (utxo === undefined) {
      break
    }

    total_value += utxo.value
    tx.inputs.push(Coin.from_dict({
      fromHash: utxo.hash,
      fromIndex: utxo.idx,
      value: utxo.value,
      lockTime: utxo.lockTime
    }))
  }
  tx.outputs[0].na = total_value - tx.calculate_fee()
  return tx
}

export async function create_post (address, post_type, content, title = null, ref = null) {
  let post_content = {
    'type': post_type,
    'content': {
      'body': content
    }
  }

  if (title !== null) {
    post_content.content.title = title
  }
  if (ref !== null) {
    post_content.ref = ref
  }

  let hash = await ipfs_push(post_content)
  let remark = `IPFS;P;${hash}`
  let tx = await prepare_remark_tx(address, remark)
  // tx.sign(Buffer.from(account.private_key, 'hex'))
  // let signed_tx = tx.serialize().toString('hex')
  return tx
}

export async function broadcast (tx,
                                 {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios.post('${api_server}/broadcast', {
    txHex: this.signed_tx
  })
  return response.data.value;
}
