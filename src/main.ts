import { Framework } from "@vechain/connex-framework";
import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { IVEXCHANGEV2PAIR_ABI } from "./abi/IVexchangeV2Pair";
import {add, find} from 'lodash'
import { BigNumber, ethers } from "ethers";
import * as assert from "assert";
import {formatEther} from "ethers/lib/utils";

const MAINNET_NODE_URL = "https://jp.mainnet-node.vexchange.io"
const VEED_VET_PAIR_ADDRESS = "0x3A778a7B141e846c53D03BA4c1899326eE0D0c14"
const PAIR_CREATED_BLOCK = 9559526
const MARCH_3_0000_UTC_BLOCK = 1646265600

async function Main()
{
    const lNet = new SimpleNet(MAINNET_NODE_URL);
    const lDriver = await Driver.connect(lNet);
    const lProvider = new Framework(lDriver);

    const lVeedVetPairContract = lProvider.thor.account(VEED_VET_PAIR_ADDRESS);

    const lTransferEventABI: object = find(IVEXCHANGEV2PAIR_ABI.abi, { name: "Transfer" });
    // const lBurnEventABI = find(IVEXCHANGEV2PAIR_ABI, { name: "Burn" });

    const lTransferEvent: Connex.Thor.Account.Event = lVeedVetPairContract.event(lTransferEventABI);
    // const lBurnEvent: Connex.Thor.Account.Event = lVeedVetPairContract.event(lBurnEventABI);

    const lTransferEventFilter: Connex.Thor.Filter<"event", Connex.Thor.Account.WithDecoded>
                            = lTransferEvent.filter([]).range({
                            unit: "block",
                            from: PAIR_CREATED_BLOCK,
                            to: MARCH_3_0000_UTC_BLOCK
                        })

    let lEnd: boolean = false
    let lOffset: number = 0;
    const lLimit: number = 256;
    const lAccountBalances: Map<string, BigNumber> = new Map();

    while (!lEnd)
    {
        const result: Connex.Thor.Filter.Row<"event", Connex.Thor.Account.WithDecoded>[] =
            await lTransferEventFilter.apply(lOffset, lLimit);

        for (const transaction of result)
        {
            const lSender = transaction.meta.txOrigin;

            if (!lAccountBalances.has(lSender))
            {
                lAccountBalances.set(lSender, ethers.constants.Zero);
            }

            const lPrevBal = lAccountBalances.get(lSender);
            if (lPrevBal !== undefined)
            {
                // this is a liquidity provision operation
                if (transaction.decoded.from === ethers.constants.AddressZero)
                {
                    lAccountBalances.set(lSender, lPrevBal.add(transaction.decoded.value));
                }
                // this is a liquidity removal operation
                else if (transaction.decoded.to === ethers.constants.AddressZero)
                {
                    lAccountBalances.set(lSender, lPrevBal.sub(transaction.decoded.value));
                }
                // intermediate transactions to the pair contract for burning, ignore
                else if (transaction.decoded.to === VEED_VET_PAIR_ADDRESS.toLowerCase() ||
                         transaction.decoded.from === VEED_VET_PAIR_ADDRESS.toLowerCase())
                {}
                // other transfers of the LP token, ignore
                else
                {}
            }
        }

        if (result.length === lLimit) lOffset += lLimit;
        else lEnd = true;
    }

    console.log("Liquidity as of 3 Mar 0000 UTC+0")
    lAccountBalances.forEach((aBal) => {
        console.log(formatEther(aBal.toString()));
    })
}

Main()
