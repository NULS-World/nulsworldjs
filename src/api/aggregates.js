import axios from 'axios'
import {ipfs_push, prepare_remark_tx} from './create'
import {DEFAULT_SERVER} from './base'

export async function fetch_profile(address, {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios.get(`${api_server}/addresses/aggregates/${address}.json?keys=profile`)
  if ((response.data.data !== undefined) && (response.data.data.profile !== undefined))
  {
    return response.data.data.profile
  } else
    return null
}

export async function submit_aggregate (address, key, content, {api_server = DEFAULT_SERVER} = {}) {
  let post_content = {
    'key': key,
    'content': content
  }

  let hash = await ipfs_push(post_content, {api_server: api_server})
  let remark = `IPFS;A;${hash}`
  let tx = await prepare_remark_tx(address, remark, {api_server: api_server})
  // tx.sign(Buffer.from(account.private_key, 'hex'))
  // let signed_tx = tx.serialize().toString('hex')
  return tx
}
