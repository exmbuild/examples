const { Exm, ContractType } = require("@execution-machine/sdk");
const { readFileSync } = require("fs");

(async () => {
    const exm = new Exm({ token: "YOUR_TOKEN_GOES_HERE" });
    const appSourceCode = readFileSync('function.js');
    const deployApp = await exm.functions.deploy(appSourceCode, { adminName: "Superman" }, ContractType.JS);
    console.log(`Successfully deployed with id ${deployApp.id}\n`);

    // Update Admin Name
    const writeToApp = await exm.functions.write(deployApp.id, { newAdminName: "Clark Kent", fn: "SET_ADMIN_NAME" });
    console.log(`Successfully written to ${deployApp.id}. State:`);
    console.log(writeToApp.data.execution.state);

    // Get Admin Name
    const getAppAdminName = await exm.functions.write(deployApp.id, { fn: "GET_ADMIN_NAME" });
    console.log(writeToApp.data.execution.result);
})();