
const regex = /希望プラン[(（]Pro\s*[\/\s]*Pro\+[)）][:：]\s*((?:Trial\s+)?Pro\+?)/i;

const testCases = [
    "希望プラン(Pro/Pro+): Pro",
    "希望プラン(Pro / Pro+): Pro+",
    "希望プラン(Pro/Pro+): Trial Pro",
    "希望プラン(Pro / Pro+): Trial Pro+",
    "希望プラン(Pro / Pro+): trial pro+",
    "希望プラン(Pro/Pro+): PRO",
];

console.log("Testing Regex:", regex);

testCases.forEach(input => {
    const match = input.match(regex);
    console.log(`Input: "${input}"`);
    console.log(`Match: ${match ? match[1] : "NO MATCH"}`);
    console.log("---");
});
