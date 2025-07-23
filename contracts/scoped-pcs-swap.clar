(use-trait sip-010 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant ERR_SWAP_NOT_FOUND (err u100))
(define-constant ERR_TOKEN_MISMATCH (err u101))
(define-constant ERR_TRANSFER_FAILED (err u102))

(define-map swaps-available
  uint
  {
    token-a: (optional principal),
    name-a: (string-ascii 32),
    amount-a: uint,
    token-b: (optional principal),
    name-b: (string-ascii 32),
    amount-b: uint,
    opened-by: principal,
  }
)

(define-data-var swap-id uint u0)

(define-public (add-swap
    (token-a (optional <sip-010>))
    (name-a (string-ascii 32))
    (amount-a uint)
    (token-b (optional <sip-010>))
    (name-b (string-ascii 32))
    (amount-b uint)
  )
  (let ((id (var-get swap-id)))
    ;; Add the swap to the map
    (map-set swaps-available id {
      token-a: (match token-a
        a (some (contract-of a))
        none
      ),
      name-a: name-a,
      amount-a: amount-a,
      token-b: (match token-b
        b (some (contract-of b))
        none
      ),
      name-b: name-b,
      amount-b: amount-b,
      opened-by: tx-sender,
    })
    (var-set swap-id (+ id u1))
    ;; Emit an event for the swap creation
    (print {
      id: id,
      token-a: token-a,
      name-a: name-a,
      amount-a: amount-a,
      token-b: token-b,
      name-b: name-b,
      amount-b: amount-b,
      opened-by: tx-sender,
    })
    ;; Transfer the tokens to the contract to escrow
    (match token-a
      a (contract-call? a transfer amount-a tx-sender (as-contract tx-sender) none)
      (stx-transfer? amount-a tx-sender (as-contract tx-sender))
    )
  )
)

(define-public (fulfill-swap
    (id uint)
    (token-a (optional <sip-010>))
    (token-a-name (string-ascii 128))
    (token-b (optional <sip-010>))
  )
  (let (
      (swap (unwrap! (map-get? swaps-available id) ERR_SWAP_NOT_FOUND))
      (swap-a (get token-a swap))
      (swap-b (get token-b swap))
      (amount-a (get amount-a swap))
      (amount-b (get amount-b swap))
      (recipient (get opened-by swap))
      (caller tx-sender)
    )
    ;; Verify and send token b to the recipient
    (unwrap!
      (match token-b
        trait-b (let ((b (unwrap! swap-b ERR_TOKEN_MISMATCH)))
          (asserts! (is-eq (contract-of trait-b) b) ERR_TOKEN_MISMATCH)
          (contract-call? trait-b transfer amount-b tx-sender recipient none)
        )
        (stx-transfer? amount-b tx-sender recipient)
      )
      ERR_TRANSFER_FAILED
    )
    ;; Verify and send token a to the caller
    (unwrap!
      (match token-a
        trait-a (let ((a (unwrap! swap-a ERR_TOKEN_MISMATCH)))
          (asserts! (is-eq (contract-of trait-a) a) ERR_TOKEN_MISMATCH)
          (with-post-conditions {
            stx: u0,
            fts: (list {
              contract: (contract-of trait-a),
              token: token-a-name,
              amount: amount-a,
            }),
            nfts: (list),
          }
            (as-contract (contract-call? trait-a transfer amount-a tx-sender caller none))
          )
        )
        (as-contract (stx-transfer? amount-a tx-sender caller))
      )
      ERR_TRANSFER_FAILED
    )
    ;; Emit an event for the swap fulfillment
    (print {
      id: id,
      token-a: token-a,
      name-a: (get name-a swap),
      amount-a: amount-a,
      token-b: token-b,
      name-b: (get name-b swap),
      amount-b: amount-b,
      opened-by: recipient,
      fulfilled-by: tx-sender,
    })
    ;; Remove the swap from the map
    (map-delete swaps-available id)
    (ok true)
  )
)

(define-public (cancel-swap
    (id uint)
    (token-a (optional <sip-010>))
    (token-a-name (string-ascii 128))
  )
  (let (
      (swap (unwrap! (map-get? swaps-available id) ERR_SWAP_NOT_FOUND))
      (caller tx-sender)
      (swap-a (get token-a swap))
      (amount-a (get amount-a swap))
    )
    ;; Verify the caller is the sender of the swap
    (asserts! (is-eq tx-sender (get opened-by swap)) ERR_SWAP_NOT_FOUND)
    ;; Verify token-a and refund the tokens to the sender
    (unwrap!
      (match token-a
        trait-a (let ((a (unwrap! swap-a ERR_TOKEN_MISMATCH)))
          (asserts! (is-eq (contract-of trait-a) a) ERR_TOKEN_MISMATCH)
          (with-post-conditions {
            stx: u0,
            fts: (list {
              contract: (contract-of trait-a),
              token: token-a-name,
              amount: amount-a,
            }),
            nfts: (list),
          }
            (as-contract (contract-call? trait-a transfer amount-a tx-sender caller none))
          )
        )
        (as-contract (stx-transfer? amount-a tx-sender caller))
      )
      ERR_TRANSFER_FAILED
    )
    ;; Remove the swap from the map
    (map-delete swaps-available id)
    (ok true)
  )
)

;; This function is used to make this contract compile successfully.
;; In the real implementation, `with-post-conditions` would be a built-in
;; function that handles setting up post-conditions to check the assets that
;; were transferred in the `body`, and panic if the conditions are not met.
(define-private (with-post-conditions
    (assets {
      stx: uint,
      fts: (list
        32
        {
          contract: principal,
          token: (string-ascii 128),
          amount: uint,
        }
      ),
      nfts: (list
        32
        {
          contract: principal,
          token: (string-ascii 128),
          identifier: uint,
        }
      ),
    })
    (body (response bool uint))
  )
  body
)
