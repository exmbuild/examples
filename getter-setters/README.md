# Usage

In this example, you'll be able to deploy and run a quick getter/setter on EXM which will live in permanency under Arweave.

# NodeJS

```shell
$ node exm-sdk.js
```

# CLI

```shell
$ exm function:deploy --src function.js --init-state '{"adminName": "Superman"}' --token YOUR_EXM_TOKEN
```
```shell
curl --location --request POST 'https://[functionId].exm.run' \
--header 'Content-Type: application/json' \
--data-raw '{
    "newAdminName": "Andres Pirela",
    "fn": "SET_ADMIN_NAME"
}'
```

# Steps

- Function has 2 conditional: If the `fn` in the body object is set to:
  - `SET_ADMIN_NAME`: Update state to `newAdminName` in body.
  - `GET_ADMIN_NAME`: Return the `state.adminName` name
- Function is using [one-time responses](https://docs.exm.dev/trustless-serverless-functions/introduction/function-standard#one-time-responses) when doing `GET_ADMIN_NAME`