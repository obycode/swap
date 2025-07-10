# Asset Protection Design Exploration

This repository explores asset protection mechanisms in Clarity smart contracts
through the lens of a token swap contract. The primary goal is to investigate
and demonstrate new Clarity expressions that would allow contracts to better
protect their assets.

## Repository Purpose

This is an **experimental design exploration** focused on:

1. **Asset Protection Patterns** - Exploring how contracts can safeguard tokens
   and assets
2. **Design Space Investigation** - Testing different approaches to asset
   scoping and control
3. **Clarity Language Evolution** - Proposing and prototyping new language
   features

## Contracts

- **`unsafe-swap.clar`** - A baseline swap contract without asset protection
- **`asset-scope-swap.clar`** - An experimental version exploring asset scoping
  mechanisms

## The Asset Protection Problem

Smart contracts on Stacks currently have limited asset protection capabilities.
This leads to vulnerabilities when:

- Contracts hold assets of their own or user assets in escrow
- Contracts make contract calls to potentially untrusted traits

This repository uses a swap contract as a practical example to explore
solutions.

## Design Exploration

### unsafe-swap.clar - The Baseline

The baseline swap contract which demonstrates the typical vulnerability -- the
contract makes a contract call to a trait, passed in by the user, from the
contract's context, which has full access to the contract's assets.

**Key Functions:**

- `add-swap`: Create a new swap offer
- `fulfill-swap`: Complete an existing swap
- `cancel-swap`: Cancel your own swap and get tokens back

### Asset Scopes - asset-scope-swap.clar

In this contract, we experiment with asset-scoping, where a new expression
creates a sandbox environment, with limited access to the contract's assets.

**Proposed Syntax:**

```clarity
(with-assets
  (list {
    owner: (as-contract tx-sender),
    asset: (some token-contract),
    amount: transfer-amount,
  })
  ;; Only specified assets are accessible in this scope
  (transfer-operation)
)
```

The code within the `with-assets` block can only access the assets declared in
the list. This allows for an opt-in approach to asset access and prevents
unauthorized access to other contract assets. For example, if the contract holds
100 STX, but the `with-assets` block only allows access to 10 STX, any attempt
to transfer more than 10 STX will fail, as though the contract only had 10 STX
available.

If the `with-assets` block specifies access to more of an asset than what is
actually held by the contract, the block will execute with access to the full
amount of that asset held by the contract. For example, if the contract holds
100 STX, but the `with-assets` block specifies access to 200 STX, the block will
execute with access to the full 100 STX. By allowing this, we enable more
flexibility with dynamically defined amounts, while still ensuring that the
contract cannot access more than it actually holds.

#### Composability

When `with-assets` expressions are nested, the inner scope can access, and
optionally further restrict, assets specified by the outer scope. The code body
of the inner scope will then have access to the intersection of these asset
limits (the minimum of the amounts specified in the outer and inner scopes). If
it is possible to determine statically that the inner scope attempts to access
more than allowed by the outer scope, tooling should raise a warning, but it is
still valid Clarity code.

```clarity
(with-assets
  (list { owner: (as-contract tx-sender), asset: (some token-contract), amount: 10 })
  (with-assets
    (list { owner: (as-contract tx-sender), asset: (some token-contract), amount: 5 })
    ;; This inner scope can only access the 5 STX specified
    (transfer-operation)
  )
)

(with-assets
  (list { owner: (as-contract tx-sender), asset: (some token-contract), amount: 5 })
  (with-assets
    (list { owner: (as-contract tx-sender), asset: (some token-contract), amount: 10 })
    ;; This inner scope can access the 5 STX as specified by the outer scope.
    (transfer-operation)
  )
)
```
