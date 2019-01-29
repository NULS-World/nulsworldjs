import axios from 'axios'
import {DEFAULT_SERVER} from './base'

export async function get_aliases({api_server = DEFAULT_SERVER} = {}) {
  let response = await axios(`${api_server}/addresses/aliases/all.json`)
  if ((response.data !== undefined) && (response.data.aliases !== undefined))
    return response.data.aliases
}
