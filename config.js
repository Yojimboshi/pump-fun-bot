const { PublicKey } = require("@solana/web3.js");

const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMP_GLOBAL = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
const PUMP_EVENT_AUTHORITY = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");
const PUMP_FEE = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
const PUMP_LIQUIDITY_MIGRATOR = new PublicKey("39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg");
const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
const SYSTEM_TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSTEM_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
const SOL = new PublicKey("So11111111111111111111111111111111111111112");
const LAMPORTS_PER_SOL = 1_000_000_000;

// Trading parameters
const BUY_AMOUNT = 0.0001; // Amount of SOL to spend when buying
const BUY_SLIPPAGE = 0.2; // 20% slippage tolerance for buying
const SELL_SLIPPAGE = 0.2; // 20% slippage tolerance for selling

module.exports = {
    PUMP_PROGRAM,
    PUMP_GLOBAL,
    PUMP_EVENT_AUTHORITY,
    PUMP_FEE,
    PUMP_LIQUIDITY_MIGRATOR,
    SYSTEM_PROGRAM,
    SYSTEM_TOKEN_PROGRAM,
    SYSTEM_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM,
    SYSTEM_RENT,
    SOL,
    LAMPORTS_PER_SOL,
    BUY_AMOUNT,
    BUY_SLIPPAGE,
    SELL_SLIPPAGE
};
