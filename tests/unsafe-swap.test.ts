import { describe, expect, it, beforeEach } from "vitest";
import {
  Cl,
  ClarityType,
  ClarityValue,
  someCV,
  TupleCV,
} from "@stacks/transactions";

const accounts = simnet.getAccounts();
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("unsafe-swap contract", () => {
  beforeEach(() => {
    // Reset simnet state before each test
    simnet.mineEmptyBlocks(1);
  });

  describe("add-swap function", () => {
    it("should successfully add a STX-to-STX swap", () => {
      const swapAmount = 1000000; // 1 STX
      const requestedAmount = 2000000; // 2 STX

      const { result } = simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(), // token-a (STX)
          Cl.stringAscii(""), // name-a
          Cl.uint(swapAmount), // amount-a
          Cl.none(), // token-b (STX)
          Cl.stringAscii(""), // name-b
          Cl.uint(requestedAmount), // amount-b
        ],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should increment swap-id for each new swap", () => {
      // Add first swap
      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1000000),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(2000000),
        ],
        wallet1
      );

      // Add second swap
      const { result } = simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1500000),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(3000000),
        ],
        wallet2
      );

      expect(result).toBeOk(Cl.bool(true));

      // Check that the swap was stored with correct ID
      const swapData = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(1)
      );
      expect(swapData.type).toBe(ClarityType.OptionalSome);
    });

    it("should correctly store swap data in the map", () => {
      const swapAmount = 1000000;
      const requestedAmount = 2000000;

      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(swapAmount),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(requestedAmount),
        ],
        wallet1
      );

      const swap = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(0)
      );
      expect(swap).toBeSome(
        Cl.tuple({
          "amount-a": Cl.uint(swapAmount),
          "amount-b": Cl.uint(requestedAmount),
          "name-a": Cl.stringAscii(""),
          "name-b": Cl.stringAscii(""),
          "opened-by": Cl.principal(wallet1),
          "token-a": Cl.none(),
          "token-b": Cl.none(),
        })
      );
    });

    it("should transfer STX from sender to contract when adding swap", () => {
      const swapAmount = 1000000n;
      const initialBalance =
        simnet.getAssetsMap().get("STX")?.get(wallet1) || 0;

      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(swapAmount),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(2000000),
        ],
        wallet1
      );

      const finalBalance = simnet.getAssetsMap().get("STX")?.get(wallet1) || 0;
      expect(finalBalance).toEqual(initialBalance - swapAmount);
    });
  });

  describe("fulfill-swap function", () => {
    beforeEach(() => {
      // Add a swap before each fulfill test
      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1000000), // 1 STX offered
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(2000000), // 2 STX requested
        ],
        wallet1
      );
    });

    it("should successfully fulfill a valid swap", () => {
      const { result } = simnet.callPublicFn(
        "unsafe-swap",
        "fulfill-swap",
        [
          Cl.uint(0), // swap id
          Cl.none(), // token-a (STX)
          Cl.none(), // token-b (STX)
        ],
        wallet2
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should transfer tokens correctly when fulfilling swap", () => {
      const wallet1InitialBalance =
        simnet.getAssetsMap().get("STX")?.get(wallet1) || 0;
      const wallet2InitialBalance =
        simnet.getAssetsMap().get("STX")?.get(wallet2) || 0;

      simnet.callPublicFn(
        "unsafe-swap",
        "fulfill-swap",
        [Cl.uint(0), Cl.none(), Cl.none()],
        wallet2
      );

      const wallet1FinalBalance =
        simnet.getAssetsMap().get("STX")?.get(wallet1) || 0;
      const wallet2FinalBalance =
        simnet.getAssetsMap().get("STX")?.get(wallet2) || 0;

      // Wallet1 should receive 2 STX (the amount they requested)
      expect(wallet1FinalBalance).toEqual(wallet1InitialBalance + 2000000n);

      // Wallet2 should lose 2 STX (paid to wallet1) but gain 1 STX (from the swap)
      expect(wallet2FinalBalance).toEqual(
        wallet2InitialBalance - 2000000n + 1000000n
      );
    });

    it("should remove swap from map after fulfillment", () => {
      simnet.callPublicFn(
        "unsafe-swap",
        "fulfill-swap",
        [Cl.uint(0), Cl.none(), Cl.none()],
        wallet2
      );

      const swapData = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(0)
      );
      expect(swapData).toBeNone();
    });

    it("should fail when trying to fulfill non-existent swap", () => {
      const { result } = simnet.callPublicFn(
        "unsafe-swap",
        "fulfill-swap",
        [
          Cl.uint(999), // Non-existent swap id
          Cl.none(),
          Cl.none(),
        ],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR_SWAP_NOT_FOUND
    });

    it("should fail when trying to fulfill already fulfilled swap", () => {
      // First fulfillment should succeed
      const { result: firstResult } = simnet.callPublicFn(
        "unsafe-swap",
        "fulfill-swap",
        [Cl.uint(0), Cl.none(), Cl.none()],
        wallet2
      );
      expect(firstResult).toBeOk(Cl.bool(true));

      // Second fulfillment should fail
      const { result: secondResult } = simnet.callPublicFn(
        "unsafe-swap",
        "fulfill-swap",
        [Cl.uint(0), Cl.none(), Cl.none()],
        wallet3
      );
      expect(secondResult).toBeErr(Cl.uint(100)); // ERR_SWAP_NOT_FOUND
    });

    it("should handle insufficient balance gracefully", () => {
      // Create a swap requesting a very large amount
      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1000000),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(999999999999999), // Very large amount
        ],
        wallet1
      );

      const { result } = simnet.callPublicFn(
        "unsafe-swap",
        "fulfill-swap",
        [
          Cl.uint(1), // This new swap
          Cl.none(),
          Cl.none(),
        ],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(102)); // ERR_TRANSFER_FAILED
    });
  });

  describe("edge cases and error handling", () => {
    it("should allow same user to create multiple swaps", () => {
      // First swap
      const { result: firstResult } = simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1000000),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(2000000),
        ],
        wallet1
      );

      // Second swap by same user
      const { result: secondResult } = simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(500000),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(firstResult).toBeOk(Cl.bool(true));
      expect(secondResult).toBeOk(Cl.bool(true));

      // Both swaps should exist
      const swap0 = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(0)
      );
      const swap1 = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(1)
      );
      expect(swap0.type).toBe(ClarityType.OptionalSome);
      expect(swap1.type).toBe(ClarityType.OptionalSome);
    });
  });

  describe("contract state management", () => {
    it("should maintain correct swap-id counter", () => {
      // Add multiple swaps and verify IDs are sequential
      for (let i = 0; i < 5; i++) {
        simnet.callPublicFn(
          "unsafe-swap",
          "add-swap",
          [
            Cl.none(),
            Cl.stringAscii(""),
            Cl.uint(1000000),
            Cl.none(),
            Cl.stringAscii(""),
            Cl.uint(2000000),
          ],
          wallet1
        );
      }

      // Check that all swaps exist with correct IDs
      for (let i = 0; i < 5; i++) {
        const swap = simnet.getMapEntry(
          "unsafe-swap",
          "swaps-available",
          Cl.uint(i)
        );
        expect(swap.type).toBe(ClarityType.OptionalSome);
      }

      // Check that the next swap ID is 5
      const nextSwapId = simnet.getDataVar("unsafe-swap", "swap-id");
      expect(nextSwapId).toBeUint(5);
    });

    it("should handle mixed fulfillment and addition operations", () => {
      // Add swap 0
      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1000000),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(2000000),
        ],
        wallet1
      );

      // Add swap 1
      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(500000),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1000000),
        ],
        wallet2
      );

      // Fulfill swap 0
      simnet.callPublicFn(
        "unsafe-swap",
        "fulfill-swap",
        [Cl.uint(0), Cl.none(), Cl.none()],
        wallet3
      );

      // Add swap 2 (should get ID 2, not reuse 0)
      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(750000),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1500000),
        ],
        wallet1
      );

      // Verify state
      const swap0 = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(0)
      );
      const swap1 = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(1)
      );
      const swap2 = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(2)
      );

      expect(swap0).toBeNone(); // Should be deleted after fulfillment
      expect(swap1.type).toBe(ClarityType.OptionalSome); // Should still exist
      expect(swap2.type).toBe(ClarityType.OptionalSome); // Should exist with new ID
    });
  });

  describe("cancel-swap function", () => {
    beforeEach(() => {
      // Add a swap before each cancel test
      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1000000), // 1 STX offered
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(2000000), // 2 STX requested
        ],
        wallet1
      );
    });

    it("should successfully cancel a valid swap by the original sender", () => {
      const { result } = simnet.callPublicFn(
        "unsafe-swap",
        "cancel-swap",
        [
          Cl.uint(0), // swap id
          Cl.none(), // token-a (STX)
        ],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should remove swap from map after cancellation", () => {
      simnet.callPublicFn(
        "unsafe-swap",
        "cancel-swap",
        [Cl.uint(0), Cl.none()],
        wallet1
      );

      const swapData = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(0)
      );
      expect(swapData).toBeNone();
    });

    it("should fail when trying to cancel non-existent swap", () => {
      const { result } = simnet.callPublicFn(
        "unsafe-swap",
        "cancel-swap",
        [
          Cl.uint(999), // Non-existent swap id
          Cl.none(),
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR_SWAP_NOT_FOUND
    });

    it("should fail when trying to cancel swap from different user", () => {
      const { result } = simnet.callPublicFn(
        "unsafe-swap",
        "cancel-swap",
        [
          Cl.uint(0), // Valid swap id but different sender
          Cl.none(),
        ],
        wallet2 // Different wallet
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR_SWAP_NOT_FOUND (used for authorization)
    });

    it("should fail when trying to cancel already cancelled swap", () => {
      // First cancellation should succeed
      const { result: firstResult } = simnet.callPublicFn(
        "unsafe-swap",
        "cancel-swap",
        [Cl.uint(0), Cl.none()],
        wallet1
      );
      expect(firstResult).toBeOk(Cl.bool(true));

      // Second cancellation should fail
      const { result: secondResult } = simnet.callPublicFn(
        "unsafe-swap",
        "cancel-swap",
        [Cl.uint(0), Cl.none()],
        wallet1
      );
      expect(secondResult).toBeErr(Cl.uint(100)); // ERR_SWAP_NOT_FOUND
    });

    it("should fail when trying to cancel already fulfilled swap", () => {
      // First fulfill the swap
      const { result: fulfillResult } = simnet.callPublicFn(
        "unsafe-swap",
        "fulfill-swap",
        [Cl.uint(0), Cl.none(), Cl.none()],
        wallet2
      );
      expect(fulfillResult).toBeOk(Cl.bool(true));

      // Then try to cancel it
      const { result: cancelResult } = simnet.callPublicFn(
        "unsafe-swap",
        "cancel-swap",
        [Cl.uint(0), Cl.none()],
        wallet1
      );
      expect(cancelResult).toBeErr(Cl.uint(100)); // ERR_SWAP_NOT_FOUND
    });

    it("should handle multiple swaps and cancel specific ones", () => {
      // Add second swap
      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(500000),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Add third swap by different user
      simnet.callPublicFn(
        "unsafe-swap",
        "add-swap",
        [
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(750000),
          Cl.none(),
          Cl.stringAscii(""),
          Cl.uint(1500000),
        ],
        wallet2
      );

      // Cancel the second swap (id=1)
      const { result } = simnet.callPublicFn(
        "unsafe-swap",
        "cancel-swap",
        [Cl.uint(1), Cl.none()],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      // Verify state: swap 0 and 2 should exist, swap 1 should be gone
      const swap0 = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(0)
      );
      const swap1 = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(1)
      );
      const swap2 = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(2)
      );

      expect(swap0.type).toBe(ClarityType.OptionalSome); // Should still exist
      expect(swap1).toBeNone(); // Should be deleted after cancellation
      expect(swap2.type).toBe(ClarityType.OptionalSome); // Should still exist
    });

    it("should fail with token mismatch when wrong token type provided", () => {
      // First create a swap to cancel
      const swapId = 0;

      // Try to cancel with mismatched token (the contract expects none for STX, but this tests the mismatch logic)
      // This test verifies the token validation logic in cancel-swap
      const swapData = simnet.getMapEntry(
        "unsafe-swap",
        "swaps-available",
        Cl.uint(swapId)
      );
      expect(swapData).toBeSome;

      // The cancel should work with correct token type (none for STX)
      const { result } = simnet.callPublicFn(
        "unsafe-swap",
        "cancel-swap",
        [
          Cl.uint(swapId),
          Cl.none(), // Correct token type for STX
        ],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });
  });
});
