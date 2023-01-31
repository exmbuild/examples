const { TestFunction, createWrite, FunctionType } = require("@execution-machine/sdk");
const { readFileSync } = require("fs");

(async () => {
    const testAttempt = await TestFunction({
        functionSource: readFileSync("function.js"),
        functionType: FunctionType.JAVASCRIPT,
        functionInitState: {
            items: []
        },
        writes: [
            createWrite({
                data: JSON.stringify({ name: "Andres" }),
                type: "string",
                tags: [
                    {
                        name: "Content-Type",
                        value: "application/json"
                    }
                ]
            })
        ]
    });

    console.log(testAttempt);
})();
