const { TestFunction, createWrite, FunctionType } = require("@execution-machine/sdk");
const { readFileSync } = require("fs");

(async () => {
    const testAttempt = await TestFunction({
        functionSource: readFileSync("function.js"),
        functionType: FunctionType.JAVASCRIPT,
        functionInitState: {
            adminName: "Andres Pirela"
        },
        writes: [
            createWrite({
                data: JSON.stringify({ newAdminName: "Andres" }),
            })
        ]
    });

    console.log(testAttempt);
})();
