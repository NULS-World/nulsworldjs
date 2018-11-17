
export async function call_view_method (address, method, args) {
  let response = await axios.post('/addresses/contracts/call', {
    "contractAddress": address,
    "methodName": method,
    "args": args
  })
  return response.data.result
}
