# Usage

In this example, you'll be able to deploy and run a quick user registry on EXM which will live in permanency under Arweave.

# NodeJS

```shell
$ node exm-sdk.js
```

# CLI

```shell
$ exm function:deploy --src function.js --init-state '{"users": []}' --token YOUR_EXM_TOKEN
```
```shell
$ exm function:write <functionId> --input '{"username": "Clark Kent"}' --token YOUR_EXM_TOKEN
```