import {DEFAULT_SERVER} from './base'
import {
  CHEAP_UNIT_FEE,
  Transaction, Coin} from '../model/transaction'
import {get_outputs} from './create.js'
import axios from 'axios'


export async function call_view_method (address, method, args,
                                        {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios.post(`${api_server}/addresses/contracts/call`, {
    "contractAddress": address,
    "methodName": method,
    "args": args
  })
  return response.data.result
}

export async function prepare_contract_call_tx (address, contract_address,
                                                method, args,
                                                remark,
                                               {value = 0,
                                                method_desc = '',
                                                api_server = DEFAULT_SERVER,
                                                gas_price = 25,
                                                gas_limit = 10000} = {}) {
  // WARNING: value not handled correctly yet.
  let outputs_data = await get_outputs(address, {'api_server': api_server})

  let tx = Transaction.from_dict(
    {
      'inputs': [

      ],
      'outputs': [
        {address: hash_from_address(address),
          value: outputs_data.total_available}
      ],
      'type': 101,
      'scriptSig': '',
      'remark': remark,
      'info': {
        'sender': address,
        'contractAddress': contract_address,
        'value': value,
        'gasLimit': gas_limit,
        'price': gas_price,
        'methodName': method,
        'methodDesc': method_desc, // why is this even needed?
        'args': args
      }
    }
  )

  let total_value = 0
  while (total_value < (CHEAP_UNIT_FEE+(gas_price*gas_limit)+value)) {
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
  tx.outputs[0].na = total_value - tx.calculate_fee() - (gas_price*gas_limit) // value not implemented
  return tx
}
