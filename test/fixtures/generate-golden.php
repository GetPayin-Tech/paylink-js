<?php

declare(strict_types=1);

/**
 * Generates golden signature vectors that prove the JS SDK computes signatures
 * byte-for-byte identical to the PayLink server. This uses the SAME primitive
 * the server uses — base64_encode(hash_hmac('sha256', implode('', $values),
 * $hashToken, true)) — with NO Laravel/DB dependency.
 *
 * Each case pairs a camelCase `input` (what an SDK caller passes) with `values`
 * (the exact ordered concatenation the server builds from that input, per the
 * FormRequest rules() order). The JS suite feeds `input` through the SDK and
 * asserts the resulting signature equals `expected`, and separately asserts
 * buildSignature(`values`) equals `expected`.
 *
 * Run: php test/fixtures/generate-golden.php > test/fixtures/golden-signatures.json
 */
$hashToken = 'test_hash_token_abc123';

$sign = static function (array $values) use ($hashToken): string {
    return base64_encode(hash_hmac('sha256', implode('', $values), $hashToken, true));
};

$cases = [
    [
        'name' => 'invoices.create full',
        'endpoint' => 'INVOICE_CREATE',
        'input' => [
            'firstName' => 'John', 'lastName' => 'Doe', 'email' => 'john@example.com',
            'orderTitle' => 'Gold Plan', 'orderAmount' => 250, 'address' => '1 Main St',
            'city' => 'Cairo', 'country' => 'EG', 'state' => 'C', 'currency' => 'USD',
            'redirectionUrl' => 'https://shop.example.com/return',
            'webhookUrl' => 'https://shop.example.com/webhook',
            'orderDetails' => 'note', 'paymentMode' => 'authorize',
        ],
        'values' => ['John', 'Doe', 'john@example.com', 'Gold Plan', '250', '1 Main St', 'Cairo', 'EG', 'C', 'USD', 'https://shop.example.com/return', 'https://shop.example.com/webhook', 'note'],
    ],
    [
        'name' => 'invoices.create minimal (optionals skipped)',
        'endpoint' => 'INVOICE_CREATE',
        'input' => [
            'firstName' => 'Jane', 'lastName' => 'Roe', 'email' => 'jane@example.com',
            'orderTitle' => 'Basic', 'orderAmount' => '100.00', 'currency' => 'EGP',
        ],
        'values' => ['Jane', 'Roe', 'jane@example.com', 'Basic', '100.00', 'EGP'],
    ],
    [
        'name' => 'payments.void',
        'endpoint' => 'PAYMENT_VOID',
        'input' => ['invoiceId' => 12345],
        'values' => ['12345'],
    ],
    [
        'name' => 'payments.refund',
        'endpoint' => 'PAYMENT_REFUND',
        'input' => ['invoiceId' => 12345, 'amount' => '10.50'],
        'values' => ['12345', '10.50'],
    ],
    [
        'name' => 'payments.settle',
        'endpoint' => 'PAYMENT_SETTLE',
        'input' => ['invoiceId' => 777, 'amount' => 50],
        'values' => ['777', '50'],
    ],
    [
        'name' => 'payments.reverseAuthorization',
        'endpoint' => 'PAYMENT_REVERSE_AUTHORIZATION',
        'input' => ['invoiceId' => 42],
        'values' => ['42'],
    ],
    [
        'name' => 'payments.checkStatus',
        'endpoint' => 'PAYMENT_CHECK_STATUS',
        'input' => ['invoiceId' => 42],
        'values' => ['42'],
    ],
    [
        'name' => 'vcc.charge US (state block)',
        'endpoint' => 'VCC_CHARGE',
        'input' => [
            'firstName' => 'Sam', 'lastName' => 'Smith', 'email' => 'sam@example.com',
            'phone' => '+15551234567', 'currencyId' => 1, 'price' => 100, 'product' => 'Widget',
            'referenceNumber' => 'ref-1', 'cardNumber' => '4111111111111111',
            'cardExpiryMonth' => '12', 'cardExpiryYear' => '2030', 'cardCvv' => '123',
            'country' => 'US', 'address' => '5 Ave', 'city' => 'NYC',
            'usState' => 'NY', 'postalCode' => '10001',
        ],
        'values' => ['Sam', 'Smith', 'sam@example.com', '+15551234567', '1', '100', 'Widget', 'ref-1', '4111111111111111', '12', '2030', '123', 'US', '5 Ave', 'NYC', 'NY', '10001'],
    ],
    [
        'name' => 'vcc.charge EG minimal (optionals skipped, no state block)',
        'endpoint' => 'VCC_CHARGE',
        'input' => [
            'firstName' => 'Ali', 'lastName' => 'Hassan', 'currencyId' => 2, 'price' => '75',
            'product' => 'Book', 'cardNumber' => '4111111111111111',
            'cardExpiryMonth' => '01', 'cardExpiryYear' => '2031',
            'country' => 'EG', 'address' => 'Nile St', 'city' => 'Giza',
        ],
        'values' => ['Ali', 'Hassan', '2', '75', 'Book', '4111111111111111', '01', '2031', 'EG', 'Nile St', 'Giza'],
    ],
    [
        'name' => 'cards.tokenize CA (state block)',
        'endpoint' => 'CARD_TOKENIZE',
        'input' => [
            'firstName' => 'Marie', 'lastName' => 'Tremblay', 'email' => 'marie@example.com',
            'customerReference' => 'cust-9', 'externalReference' => 'ext-9',
            'cardNumber' => '4111111111111111', 'cardExpiryMonth' => '06', 'cardExpiryYear' => '2032',
            'cardCvv' => '999', 'country' => 'CA', 'address' => '10 King St', 'city' => 'Toronto',
            'canadaState' => 'ON', 'postalCode' => 'M5H 2N2',
        ],
        'values' => ['Marie', 'Tremblay', 'marie@example.com', 'cust-9', 'ext-9', '4111111111111111', '06', '2032', '999', 'CA', '10 King St', 'Toronto', 'ON', 'M5H 2N2'],
    ],
    [
        'name' => 'cards.charge US',
        'endpoint' => 'CARD_CHARGE',
        'input' => [
            'cardToken' => 'tok_abc', 'initiator' => 'merchant', 'firstName' => 'Sam',
            'lastName' => 'Smith', 'email' => 'sam@example.com', 'currency' => 'USD',
            'price' => 100, 'product' => 'Rebill', 'referenceNumber' => 'order-7',
            'country' => 'US', 'address' => '5 Ave', 'city' => 'NYC',
            'usState' => 'NY', 'postalCode' => '10001',
        ],
        'values' => ['tok_abc', 'merchant', 'Sam', 'Smith', 'sam@example.com', 'USD', '100', 'Rebill', 'order-7', 'US', '5 Ave', 'NYC', 'NY', '10001'],
    ],
    [
        'name' => 'cards.revoke',
        'endpoint' => 'CARD_REVOKE',
        'input' => ['cardToken' => 'tok_xyz'],
        'values' => ['tok_xyz'],
    ],
    [
        'name' => 'recurring.create full',
        'endpoint' => 'RECURRING_CREATE',
        'input' => [
            'firstName' => 'Sam', 'lastName' => 'Doe', 'email' => 'sam@example.com',
            'orderTitle' => 'Gold', 'orderAmount' => 250, 'currency' => 'USD',
            'cadenceInterval' => 'month', 'cadenceCount' => 1, 'totalCycles' => 12,
            'endDate' => '2027-01-01', 'consentText' => 'I authorise monthly charges.',
            'externalReference' => 'sub_1', 'redirectionUrl' => 'https://shop.example.com/r',
            'webhookUrl' => 'https://shop.example.com/w',
        ],
        'values' => ['Sam', 'Doe', 'sam@example.com', 'Gold', '250', 'USD', 'month', '1', '12', '2027-01-01', 'I authorise monthly charges.', 'sub_1', 'https://shop.example.com/r', 'https://shop.example.com/w'],
    ],
    [
        'name' => 'recurring.create minimal (optionals skipped)',
        'endpoint' => 'RECURRING_CREATE',
        'input' => [
            'firstName' => 'Sam', 'lastName' => 'Doe', 'email' => 'sam@example.com',
            'orderTitle' => 'Gold', 'orderAmount' => 250, 'currency' => 'USD',
            'cadenceInterval' => 'month', 'cadenceCount' => 1,
            'consentText' => 'I authorise monthly charges.',
        ],
        'values' => ['Sam', 'Doe', 'sam@example.com', 'Gold', '250', 'USD', 'month', '1', 'I authorise monthly charges.'],
    ],
    [
        'name' => 'recurring mandate action (uid only)',
        'endpoint' => 'RECURRING_MANDATE_ACTION',
        'input' => ['mandateId' => 'MANDATE_UID_123'],
        'values' => ['MANDATE_UID_123'],
    ],
    [
        'name' => 'webhook invoice.paid (message null)',
        'endpoint' => 'WEBHOOK',
        'input' => [
            'event' => 'invoice.paid', 'event_triggered_at' => '2026-08-03T10:00:00Z',
            'timezone' => 'Z', 'success' => 1, 'invoice_id' => 123, 'invoice_status' => 'PAID',
            'message' => null,
        ],
        'values' => ['1', '123', 'PAID', ''],
    ],
    [
        'name' => 'webhook subscription.charged (optionals present)',
        'endpoint' => 'WEBHOOK',
        'input' => [
            'event' => 'subscription.charged', 'event_triggered_at' => '2026-08-03T10:00:00Z',
            'timezone' => 'Z', 'success' => 1, 'invoice_id' => 555, 'invoice_status' => 'PAID',
            'message' => 'ok', 'auth_code' => 'A1', 'mandate_id' => 'M-1',
            'external_reference' => 'sub_1', 'subscription_status' => 'active',
        ],
        'values' => ['1', '555', 'PAID', 'ok', 'M-1', 'sub_1', 'active'],
    ],
];

foreach ($cases as &$case) {
    $case['hashToken'] = $hashToken;
    $case['expected'] = $sign($case['values']);
}
unset($case);

echo json_encode(['hashToken' => $hashToken, 'cases' => $cases], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n";
