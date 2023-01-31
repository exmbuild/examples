const { TestFunction, createWrite, FunctionType } = require("@execution-machine/sdk");
const { readFileSync } = require("fs");

(async () => {
    const testAttempt = await TestFunction({
        functionSource: readFileSync("function.js"),
        functionType: FunctionType.JAVASCRIPT,
        functionInitState: {},
        writes: [createWrite({ data: "Andres" })]
    });

    console.log(testAttempt);
})();
