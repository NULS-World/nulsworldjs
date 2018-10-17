import axios from 'axios'
import {ipfs_push, prepare_remark_tx} from './create'

export async function fetch_profile(address) {
  let response = await axios.get(`/addresses/aggregates/${address}.json?keys=profile`)
  if ((response.data.data !== undefined) && (response.data.data.profile !== undefined))
  {
    return response.data.data.profile
  } else
    return null
}

export async function submit_aggregate (address, key, content) {
  let post_content = {
    'key': key,
    'content': content
  }

  let hash = await ipfs_push(post_content)
  let remark = `IPFS;A;${hash}`
  let tx = await prepare_remark_tx(address, remark)
  // tx.sign(Buffer.from(account.private_key, 'hex'))
  // let signed_tx = tx.serialize().toString('hex')
  return tx
}
