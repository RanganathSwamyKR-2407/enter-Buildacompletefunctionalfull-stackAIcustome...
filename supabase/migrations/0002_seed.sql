-- =====================================================================
-- ResolveAI — seed data
-- 20 customers · 50 orders · 60 payments · 20 tickets · 40 cases
-- 10 products · 10 knowledge documents · 10 policies · 4 agents
-- 5 fingerprints · 2 incidents · 3 escalations
-- Three demo-track setups: A) duplicate charge (Priya) B) contradiction
-- (Rahul) C) circuit breaker (Ananya)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------
insert into public.resolveai_products (sku, name, category, price, description) values
('SKU-1001', 'AeroBuds Pro Wireless Earbuds',      'audio',       2499.00, 'ANC wireless earbuds with 32h battery life'),
('SKU-1002', 'PulseFit Smartwatch S2',             'wearables',   5999.00, 'AMOLED smartwatch with SpO2 and HR tracking'),
('SKU-1003', 'ChargeMax 65W GaN Charger',          'accessories', 1299.00, 'USB-C PD 65W fast charger, compact GaN'),
('SKU-1004', 'VoltBox 20000mAh Power Bank',        'accessories', 1999.00, '20000mAh power bank with 22.5W fast charge'),
('SKU-1005', 'SwiftKey Mechanical Keyboard',       'peripherals', 4999.00, 'RGB hot-swap mechanical keyboard'),
('SKU-1006', 'LumaGlow LED Desk Lamp',             'home',          499.00, 'Dimmable LED desk lamp with USB charging port'),
('SKU-1007', 'Nimbus Air Purifier Mini',           'home',        5999.00, 'Compact HEPA air purifier for small rooms'),
('SKU-1008', 'HydroSense 1L Smart Bottle',         'lifestyle',   1299.00, 'Smart hydration bottle that syncs with the app'),
('SKU-1009', 'CineView 4K Streaming Stick',        'entertainment',3999.00, '4K HDR streaming stick with voice remote'),
('SKU-1010', 'SoundWave Bluetooth Speaker',        'audio',       1999.00, 'Portable waterproof Bluetooth speaker');

-- ---------------------------------------------------------------------
-- Customers (demo-track customers explicit, rest generated)
-- ---------------------------------------------------------------------
insert into public.resolveai_customers (customer_code, name, email, phone, city, tier, lifetime_value, orders_count, refunds_count, churn_risk, sentiment_history) values
('CUST-1001', 'Priya Sharma',   'priya.sharma@example.com',   '+91-98200-11001', 'Mumbai',    'gold',     84500.00, 12, 1, 12, '[]'::jsonb),
('CUST-1002', 'Rahul Verma',    'rahul.verma@example.com',    '+91-98110-22002', 'Delhi',     'standard', 12400.00, 4,  0, 45, '[]'::jsonb),
('CUST-1003', 'Ananya Iyer',    'ananya.iyer@example.com',    '+91-99001-33003', 'Bengaluru', 'premium',  32900.00, 8,  1, 30, '[]'::jsonb),
('CUST-1004', 'Kabir Mehta',    'kabir.mehta@example.com',    '+91-98333-44004', 'Pune',      'standard',  8600.00, 3,  0, 20, '[]'::jsonb),
('CUST-1005', 'Sneha Kulkarni', 'sneha.k@example.com',        '+91-97654-55005', 'Hyderabad', 'premium',  41200.00, 9,  2, 15, '[]'::jsonb);

insert into public.resolveai_customers (customer_code, name, email, phone, city, tier, lifetime_value, orders_count, refunds_count, churn_risk)
select
  'CUST-'||lpad((1000 + i)::text,4,'0'),
  (array['Arjun Nair','Fatima Khan','Rohan Das','Meera Pillai','Vikram Singh','Lakshmi Rao','Aditya Joshi','Pooja Reddy','Nikhil Gupta','Tara Bose','Imran Sheikh','Divya Menon','Suresh Patil','Kavya Nambiar','Shreya Jain'])[i-5],
  lower(replace((array['Arjun Nair','Fatima Khan','Rohan Das','Meera Pillai','Vikram Singh','Lakshmi Rao','Aditya Joshi','Pooja Reddy','Nikhil Gupta','Tara Bose','Imran Sheikh','Divya Menon','Suresh Patil','Kavya Nambiar','Shreya Jain'])[i-5],' ','.'))||'@example.com',
  '+91-9'||lpad(i::text,8,'0'),
  (array['Chennai','Kolkata','Jaipur','Ahmedabad','Lucknow','Kochi','Chandigarh','Nagpur','Indore','Bhopal','Visakhapatnam','Guwahati','Surat','Coimbatore','Vadodara'])[i-5],
  (array['standard','standard','premium','standard','premium','standard','gold','standard','premium','standard','standard','gold','standard','premium','standard'])[i-5],
  round((i * 1375 + 500)::numeric, 2),
  (i % 7) + 1,
  i % 3,
  ((i * 13) % 70)
from generate_series(6, 20) as s(i);

-- ---------------------------------------------------------------------
-- Orders — demo-track orders first (ORD-7001..7003)
-- ---------------------------------------------------------------------
insert into public.resolveai_orders (order_id, customer_id, status, amount, item_count, shipment_status, courier, tracking_number, gps_evidence, delivered_at, created_at) values
('ORD-7001', (select id from public.resolveai_customers where customer_code='CUST-1001'), 'pending',  2499.00, 1, 'not_shipped',        null,      null, '{}'::jsonb, null, now() - interval '2 days'),
('ORD-7002', (select id from public.resolveai_customers where customer_code='CUST-1002'), 'delivered', 1299.00, 1, 'delivered',          'Delhivery','DLV8876123901',
  '{"delivery_gps":{"lat":28.6296,"lng":77.2174},"home_gps":{"lat":28.6129,"lng":77.2295},"distance_km":2.1,"matched":false,"note":"Courier GPS recorded ~2.1 km from customer''s registered home address"}'::jsonb,
  now() - interval '3 days', now() - interval '6 days'),
('ORD-7003', (select id from public.resolveai_customers where customer_code='CUST-1003'), 'paid',     4999.00, 1, 'in_transit',         'BlueDart','BLD5903341208', '{}'::jsonb, null, now() - interval '1 day');

-- Generated orders ORD-7004..ORD-7050 (47 more)
insert into public.resolveai_orders (order_id, customer_id, status, amount, item_count, shipment_status, courier, tracking_number, delivered_at, created_at)
with gen as (
  select
    i,
    'ORD-'||lpad((7000 + i)::text,4,'0') as order_id,
    (select id from public.resolveai_customers where customer_code = 'CUST-'||lpad((1000 + (((i-4) % 20)+1))::text,4,'0')) as customer_id,
    (array['delivered','delivered','delivered','shipped','processing','paid','pending','cancelled','returned'])[(i % 9)+1] as status,
    (array[499.00, 1299.00, 1999.00, 2499.00, 3999.00, 4999.00, 5999.00, 12499.00])[(i % 8)+1] as amount,
    1 + (i % 2) as item_count,
    (array['Delhivery','BlueDart','Ekart','Delhivery','BlueDart','Delhivery','BlueDart','Ekart','Delhivery'])[(i % 9)+1] as courier
  from generate_series(4, 50) as s(i)
)
select
  order_id,
  customer_id,
  status,
  amount,
  item_count,
  case when status = 'delivered' then 'delivered'
       when status = 'shipped' then 'in_transit'
       when status in ('processing','paid') then 'not_shipped'
       else null end as shipment_status,
  courier,
  'TRK'||lpad(i::text,9,'0'),
  case when status = 'delivered' then now() - ((i % 25) || ' days')::interval else null end,
  now() - ((i % 40) || ' days')::interval
from gen;

-- Order items
insert into public.resolveai_order_items (order_id, product_id, quantity, unit_price)
select r.order_id, p.id, r.qty, p.price
from (
  select o.id as order_id,
         ((row_number() over (order by o.order_id) - 1) % 10) + 1 as sku_idx,
         1 + (o.item_count = 2)::int as qty
  from public.resolveai_orders o
) r
join public.resolveai_products p
  on p.sku = (array['SKU-1001','SKU-1002','SKU-1003','SKU-1004','SKU-1005','SKU-1006','SKU-1007','SKU-1008','SKU-1009','SKU-1010'])[r.sku_idx];

-- ---------------------------------------------------------------------
-- Payments (60 total)
-- Demo: ORD-7001 duplicated, ORD-7003 refund_api_sim_fail
-- ---------------------------------------------------------------------
insert into public.resolveai_payments (txn_id, customer_id, order_id, amount, status, method, gateway, refund_api_sim_fail, created_at) values
('TXN-P10001', (select id from public.resolveai_customers where customer_code='CUST-1001'), (select id from public.resolveai_orders where order_id='ORD-7001'), 2499.00, 'succeeded', 'UPI', 'razorpay', false, now() - interval '2 days'),
('TXN-P10002', (select id from public.resolveai_customers where customer_code='CUST-1001'), (select id from public.resolveai_orders where order_id='ORD-7001'), 2499.00, 'succeeded', 'UPI', 'razorpay', false, now() - interval '2 days' + interval '4 minutes'),
('TXN-P10003', (select id from public.resolveai_customers where customer_code='CUST-1002'), (select id from public.resolveai_orders where order_id='ORD-7002'), 1299.00, 'succeeded', 'UPI', 'razorpay', false, now() - interval '6 days'),
('TXN-P10004', (select id from public.resolveai_customers where customer_code='CUST-1003'), (select id from public.resolveai_orders where order_id='ORD-7003'), 4999.00, 'succeeded', 'UPI', 'razorpay', false, now() - interval '1 day'),
('TXN-P10099', (select id from public.resolveai_customers where customer_code='CUST-1003'), (select id from public.resolveai_orders where order_id='ORD-7003'), 4999.00, 'succeeded', 'UPI', 'razorpay', true, now() - interval '1 day' + interval '6 minutes');

-- One payment per generated order (i=5..52)
insert into public.resolveai_payments (txn_id, customer_id, order_id, amount, status, method, gateway, refund_api_sim_fail, created_at)
select
  'TXN-P'||lpad(i::text,5,'0'),
  o.customer_id, o.id, o.amount,
  (array['succeeded','succeeded','succeeded','succeeded','succeeded','pending','failed','refunded'])[(i % 8)+1],
  (array['UPI','UPI','Card','NetBanking','UPI','UPI','Card','UPI'])[(i % 8)+1],
  (array['razorpay','razorpay','payu','razorpay','payu','razorpay','payu','razorpay'])[(i % 8)+1],
  false,
  now() - ((i % 40) || ' days')::interval
from generate_series(5, 52) as s(i)
join public.resolveai_orders o on o.order_id = 'ORD-'||lpad((i+6999)::text,4,'0');

-- Duplicate payments on a subset of orders (i=53..60) — duplicate-charge scenarios
insert into public.resolveai_payments (txn_id, customer_id, order_id, amount, status, method, gateway, refund_api_sim_fail, created_at)
select
  'TXN-P'||lpad(i::text,5,'0'),
  o.customer_id, o.id, o.amount, 'succeeded', 'UPI', 'razorpay', false, o.created_at + interval '3 minutes'
from generate_series(53, 60) as s(i)
join public.resolveai_orders o on o.order_id = 'ORD-'||lpad((7004 + ((i-53)*4))::text,4,'0');

-- ---------------------------------------------------------------------
-- Refunds (historical)
-- ---------------------------------------------------------------------
insert into public.resolveai_refunds (refund_id, case_id, payment_id, customer_id, amount, status, issued_at, verification)
select
  'RF-'||lpad((i)::text,4,'0'),
  null,
  (select id from public.resolveai_payments where txn_id = 'TXN-P'||lpad((5 + (i-1)*3)::text,5,'0')),
  (select id from public.resolveai_customers where customer_code = 'CUST-'||lpad((1000 + i)::text,4,'0')),
  (array[499.00, 1299.00, 1999.00, 2499.00, 3999.00, 4999.00, 5999.00, 12499.00])[(i % 8)+1],
  'issued',
  now() - ((i * 2) || ' days')::interval,
  jsonb_build_object('payment_status','refunded','amount_match',true,'timestamp_recorded',true,'overall','passed')
from generate_series(1, 8) as s(i);

-- ---------------------------------------------------------------------
-- Tickets (previous support contacts, 20)
-- ---------------------------------------------------------------------
insert into public.resolveai_tickets (ticket_id, customer_id, subject, category, status, resolution, created_at)
select
  'TCK-'||lpad((3000+i)::text,4,'0'),
  (select id from public.resolveai_customers where customer_code = 'CUST-'||lpad((1000 + ((i % 20)+1))::text,4,'0')),
  (array['Order not delivered yet','Wrong product received','Refund status query','Charged twice for order','Damaged item on arrival','Login issue with account','Subscription not renewed','Tracking not updating','Defective earbuds','Late delivery request'])[((i-1) % 10)+1],
  (array['billing','order','billing','billing','order','account','account','order','technical','order'])[((i-1) % 10)+1],
  'closed',
  'Resolved with customer',
  now() - (((i % 25) + 5) || ' days')::interval
from generate_series(1, 20) as s(i);

-- Demo-track previous tickets
insert into public.resolveai_tickets (ticket_id, customer_id, subject, category, status, resolution, created_at) values
('TCK-3101', (select id from public.resolveai_customers where customer_code='CUST-1001'), 'Charged twice for my order', 'billing', 'closed', 'Refund issued', now() - interval '14 days'),
('TCK-3102', (select id from public.resolveai_customers where customer_code='CUST-1001'), 'Refund not credited',        'billing', 'closed', 'Refund confirmed', now() - interval '5 days'),
('TCK-3103', (select id from public.resolveai_customers where customer_code='CUST-1002'), 'Package marked delivered but not received', 'order', 'closed', 'Escalated to courier', now() - interval '4 days');

-- ---------------------------------------------------------------------
-- Knowledge documents + chunks (RAG)
-- ---------------------------------------------------------------------
insert into public.resolveai_knowledge_documents (doc_id, title, category, content, source) values
('DOC-REFUND-01', 'Duplicate Payment Refund Policy', 'policy', 'Customers who have been charged twice for a single order are eligible for a full refund of the duplicate transaction. Refund eligibility requires two successful payment transactions recorded against the same order id within the same billing session. The refund must be issued against the duplicate transaction id. Refunds are processed back to the original payment method within 5-7 business days.', 'Policy handbook v4.2'),
('DOC-REFUND-02', 'Standard Refund Window', 'policy', 'Refund requests are accepted within 30 days of the original payment date. Approved refunds are initiated only after the order record is inspected and the payment status is confirmed. If the order is still pending, the refund is held until the pending order is cancelled or corrected.', 'Policy handbook v4.2'),
('DOC-RETURN-01', 'Return & Replacement Policy', 'policy', 'Products can be returned within 7 days of delivery for a full refund or replacement. Items must be unused and in original packaging. Return pickup is arranged free of charge. Replacement is prioritized over refund for premium and gold tier customers.', 'Policy handbook v4.2'),
('DOC-CANCEL-01', 'Order Cancellation Policy', 'policy', 'Pending orders can be cancelled before shipment with a full automatic refund. Orders already shipped must be refused at the door or returned via the returns process. Cancellation of a paid order triggers a refund of the full order amount.', 'Policy handbook v4.2'),
('DOC-SUB-01', 'Subscription & Account Policy', 'policy', 'Subscriptions renew automatically unless cancelled 24 hours before renewal. Account-related refunds require identity verification of the account holder. Tier benefits are applied at the time of purchase and are not retroactive.', 'Policy handbook v4.2'),
('DOC-SHIP-01', 'Undelivered / Missing Package Procedure', 'procedure', 'When a customer reports a package as not delivered, the courier delivery record and GPS proof-of-delivery are reviewed first. If the courier record and the GPS location both match the customer home location, the delivery is considered complete. If GPS evidence contradicts the delivery claim, autonomous resolution is blocked and the case is escalated to a human agent for investigation.', 'Support operations runbook'),
('DOC-PAY-01', 'Payment Gateway Known Issues', 'faq', 'The payment gateway can occasionally create duplicate debit transactions when a timeout occurs between the bank and the gateway. A timeout does not mean the charge failed. Agents should check for multiple successful transactions with the same order id before confirming a duplicate charge.', 'Incident postmortem INC-8901'),
('DOC-TECH-01', 'Product Troubleshooting', 'faq', 'Common product issues: AeroBuds Pro pairing resets are fixed by a 10-second button hold. PulseFit Smartwatch sync issues are fixed by reinstalling the mobile app. VoltBox power bank charging issues are fixed by using the provided USB-C cable.', 'Product support knowledge base'),
('DOC-ESC-01', 'Escalation Policy', 'policy', 'A case is escalated to a human agent when: the customer has contacted support more than twice for the same issue, financial impact exceeds the automated authority limit, contradictory evidence blocks autonomous resolution, an automated action fails repeatedly, or AI confidence falls below the safe threshold.', 'Policy handbook v4.2'),
('DOC-AUTH-01', 'Refund Authority Limits', 'procedure', 'Automated refund authority: Tier-1 agents may approve refunds up to 1000 rupees. Tier-2 agents up to 5000 rupees. Managers may approve above 5000 rupees. Automated systems may issue refunds only within the customer tier authority limit. All refunds require evidence of eligibility and policy approval before execution.', 'Policy handbook v4.2');

insert into public.resolveai_knowledge_chunks (document_id, chunk_index, content, content_search, token_count)
select d.id, c.chunk_index, c.content, to_tsvector('english', c.content), array_length(regexp_split_to_array(c.content, '\s+'), 1)
from public.resolveai_knowledge_documents d, (values (0, '')) as c(chunk_index, content)
where false;

-- Chunked content (hand-split into 2-3 meaningful sections per doc)
insert into public.resolveai_knowledge_chunks (document_id, chunk_index, content, content_search, token_count)
select d.id, chunk_index, content, to_tsvector('english', content), array_length(regexp_split_to_array(content, '\s+'), 1)
from public.resolveai_knowledge_documents d, (values
  ('DOC-REFUND-01', 1, 'Customers charged twice for a single order are eligible for a full refund of the duplicate transaction. Eligibility requires two successful payment transactions against the same order id.'),
  ('DOC-REFUND-01', 2, 'The refund must be issued against the duplicate transaction id and processed back to the original payment method within 5-7 business days.'),
  ('DOC-REFUND-02', 1, 'Refund requests are accepted within 30 days of the original payment date. The order record and payment status are inspected before a refund is initiated.'),
  ('DOC-REFUND-02', 2, 'If the order is still pending, the refund is held until the pending order is cancelled or corrected.'),
  ('DOC-RETURN-01', 1, 'Products can be returned within 7 days of delivery for a full refund or replacement. Items must be unused and in original packaging.'),
  ('DOC-RETURN-01', 2, 'Return pickup is arranged free of charge. Replacement is prioritized for premium and gold tier customers.'),
  ('DOC-CANCEL-01', 1, 'Pending orders can be cancelled before shipment with a full automatic refund.'),
  ('DOC-CANCEL-01', 2, 'Orders already shipped must be refused at the door or returned via the returns process.'),
  ('DOC-SUB-01', 1, 'Subscriptions renew automatically unless cancelled 24 hours before renewal.'),
  ('DOC-SUB-01', 2, 'Account-related refunds require identity verification of the account holder.'),
  ('DOC-SHIP-01', 1, 'When a customer reports a package as not delivered, the courier delivery record and GPS proof-of-delivery are reviewed first.'),
  ('DOC-SHIP-01', 2, 'If courier record and GPS location both match the customer home location, delivery is considered complete.'),
  ('DOC-SHIP-01', 3, 'If GPS evidence contradicts the delivery claim, autonomous resolution is blocked and the case is escalated to a human agent.'),
  ('DOC-PAY-01', 1, 'The payment gateway can create duplicate debit transactions when a timeout occurs between the bank and the gateway.'),
  ('DOC-PAY-01', 2, 'A timeout does not mean the charge failed. Check for multiple successful transactions with the same order id before confirming a duplicate charge.'),
  ('DOC-TECH-01', 1, 'AeroBuds Pro pairing resets are fixed by a 10-second button hold. PulseFit Smartwatch sync issues are fixed by reinstalling the app.'),
  ('DOC-TECH-01', 2, 'VoltBox power bank charging issues are fixed by using the provided USB-C cable.'),
  ('DOC-ESC-01', 1, 'A case is escalated when the customer has contacted support more than twice for the same issue.'),
  ('DOC-ESC-01', 2, 'A case is escalated when financial impact exceeds the automated authority limit or contradictory evidence blocks autonomous resolution.'),
  ('DOC-ESC-01', 3, 'A case is escalated when an automated action fails repeatedly or AI confidence falls below the safe threshold.'),
  ('DOC-AUTH-01', 1, 'Automated refund authority: Tier-1 up to 1000 rupees, Tier-2 up to 5000 rupees, Managers above 5000 rupees.'),
  ('DOC-AUTH-01', 2, 'Automated systems may issue refunds only within the customer tier authority limit. All refunds require evidence and policy approval before execution.')
) as c(doc_id, chunk_index, content)
where d.doc_id = c.doc_id;

-- ---------------------------------------------------------------------
-- Policies (the action engine consults these)
-- ---------------------------------------------------------------------
insert into public.resolveai_policies (policy_id, name, category, description, conditions, allowed_actions, restrictions, authority_limits, effective_from) values
('POL-REF-01', 'Duplicate Payment Refund', 'refund',
 'Full refund of a duplicate transaction when two successful payments exist for the same order.',
 '{"two_successful_payments_same_order": true, "amount_within_authority": true}'::jsonb,
 '["issue_refund"]'::jsonb,
 '["refund_only_duplicate_txn", "original_payment_method", "once_per_order"]'::jsonb,
 '{"tier1": 1000, "tier2": 5000, "manager": 50000}'::jsonb, '2024-01-01'),
('POL-REF-02', 'Standard Refund Window', 'refund',
 'Refunds accepted within 30 days of payment; pending orders must be corrected first.',
 '{"within_30_days": true}'::jsonb,
 '["issue_refund"]'::jsonb,
 '["held_while_order_pending"]'::jsonb,
 '{}'::jsonb, '2024-01-01'),
('POL-RET-01', 'Return & Replacement', 'return',
 '7-day return window; replacement prioritized for premium/gold tiers.',
 '{"within_7_days": true, "unused_in_original_packaging": true}'::jsonb,
 '["issue_refund", "initiate_replacement"]'::jsonb,
 '[]'::jsonb,
 '{"replacement_tiers": ["premium", "gold"]}'::jsonb, '2024-01-01'),
('POL-CAN-01', 'Order Cancellation', 'cancellation',
 'Pending orders cancel before shipment with full automatic refund.',
 '{"order_pending": true}'::jsonb,
 '["cancel_order", "issue_refund"]'::jsonb,
 '["shipped_orders_require_return"]'::jsonb,
 '{"tier1": 1000, "tier2": 5000, "manager": 50000}'::jsonb, '2024-01-01'),
('POL-SUB-01', 'Subscription & Account', 'subscription',
 'Automatic renewal unless cancelled 24h prior; identity verification for account refunds.',
 '{"identity_verified": true}'::jsonb,
 '["update_ticket", "send_message"]'::jsonb,
 '["no_auto_refund_without_verification"]'::jsonb,
 '{}'::jsonb, '2024-01-01'),
('POL-SHIP-01', 'Undelivered Package', 'shipping',
 'Courier + GPS evidence required; contradictions block autonomous resolution.',
 '{"delivery_evidence_complete": true, "no_contradiction": true}'::jsonb,
 '["update_ticket", "send_message"]'::jsonb,
 '["no_auto_resolution_on_contradiction"]'::jsonb,
 '{}'::jsonb, '2024-01-01'),
('POL-ESC-01', 'Escalation Policy', 'escalation',
 'Escalate on repeat contact, authority overrun, contradiction, repeated action failure, or low confidence.',
 '{"any_trigger": true}'::jsonb,
 '["escalate_case"]'::jsonb,
 '[]'::jsonb,
 '{}'::jsonb, '2024-01-01'),
('POL-TEC-01', 'Technical Support & Warranty', 'technical',
 'Warranty repairs/replacements for defective products; troubleshooting before replacement.',
 '{"defect_confirmed": true}'::jsonb,
 '["update_ticket", "send_message"]'::jsonb,
 '["troubleshoot_before_replacement"]'::jsonb,
 '{}'::jsonb, '2024-01-01'),
('POL-ACC-01', 'Account Access & Security', 'account',
 'Identity verification required before account-level changes.',
 '{"identity_verified": true}'::jsonb,
 '["update_ticket", "send_message"]'::jsonb,
 '[]'::jsonb,
 '{}'::jsonb, '2024-01-01'),
('POL-RISK-01', 'Risk Control Framework', 'risk',
 'High-risk cases (fraud, repeated chargebacks, contradictory evidence) require human review.',
 '{"fraud_risk": "low", "contradiction": false}'::jsonb,
 '["issue_refund", "update_ticket", "send_message", "escalate_case"]'::jsonb,
 '["block_on_contradiction", "block_on_high_fraud_risk"]'::jsonb,
 '{}'::jsonb, '2024-01-01');

-- ---------------------------------------------------------------------
-- Agents (specialists)
-- ---------------------------------------------------------------------
insert into public.resolveai_agents (agent_key, name, description, specialties, plan_steps, allowed_tools) values
('billing', 'Billing Agent', 'Handles duplicate charges, failed payments, refunds, payment status and invoices.',
 '["duplicate_charge","failed_payment","refund","payment_status","invoice"]'::jsonb,
 '["retrieve_payments","retrieve_orders","check_policy","evaluate_gates","issue_refund"]'::jsonb,
 '["get_customer","get_order","get_payment","get_ticket_history","check_policy","issue_refund"]'::jsonb),
('order', 'Order Agent', 'Handles delivery, returns, cancellation, missing orders and order status.',
 '["delivery","return","cancellation","missing_order","order_status"]'::jsonb,
 '["retrieve_orders","retrieve_shipment","retrieve_gps","detect_contradiction","update_ticket"]'::jsonb,
 '["get_customer","get_order","get_payment","get_ticket_history","check_policy","update_ticket"]'::jsonb),
('technical', 'Technical Agent', 'Handles product problems, technical failures, known issues and troubleshooting.',
 '["product_defect","technical_failure","known_issue","troubleshooting"]'::jsonb,
 '["retrieve_products","retrieve_knowledge","propose_troubleshooting","update_ticket"]'::jsonb,
 '["get_customer","get_order","search_knowledge","check_policy","update_ticket"]'::jsonb),
('account', 'Account Agent', 'Handles account issues, subscriptions, login and profile issues.',
 '["account","subscription","login","profile"]'::jsonb,
 '["retrieve_customer","check_identity","update_ticket"]'::jsonb,
 '["get_customer","get_ticket_history","check_policy","update_ticket"]'::jsonb);

-- ---------------------------------------------------------------------
-- Cases (40) — Case Twin records
-- ---------------------------------------------------------------------
insert into public.resolveai_cases (case_id, customer_id, message_text, intent, sub_intents, urgency, sentiment, sentiment_score, priority, status, specialist, routing_reason, routing_confidence, sla_deadline, root_cause, root_cause_confidence, escalation_score, created_at) values
('CS-5001', (select id from public.resolveai_customers where customer_code='CUST-1001'),
 'I was charged twice for my order. The order is still pending and I already contacted support twice.',
 'billing', '["duplicate_charge","refund"]'::jsonb, 'high', 'negative', 0.22, 'P1', 'investigating', 'billing',
 'Payment discrepancy detected', 0.96, now() + interval '4 hours', null, null, null, now() - interval '35 minutes'),
('CS-5002', (select id from public.resolveai_customers where customer_code='CUST-1002'),
 'The courier says delivered but I never received my package.',
 'order', '["missing_package","delivery"]'::jsonb, 'high', 'negative', 0.30, 'P1', 'escalated', 'order',
 'Delivery contradiction detected', 0.91, now() + interval '5 hours', 'Delivery location mismatch', 0.88, 88.00, now() - interval '2 hours'),
('CS-5003', (select id from public.resolveai_customers where customer_code='CUST-1003'),
 'My refund is not coming through. I was charged and the refund keeps failing.',
 'billing', '["refund_failure","duplicate_charge"]'::jsonb, 'medium', 'negative', 0.35, 'P2', 'automation_paused', 'billing',
 'Repeated automated refund failure', 0.93, now() + interval '8 hours', 'Payment gateway refund API failure', 0.90, 82.00, now() - interval '3 hours');

insert into public.resolveai_cases (case_id, customer_id, message_text, intent, sub_intents, urgency, sentiment, sentiment_score, priority, status, specialist, routing_reason, routing_confidence, sla_deadline, root_cause, root_cause_confidence, escalation_score, created_at)
select
  'CS-'||lpad((5003+i)::text,4,'0'),
  (select id from public.resolveai_customers where customer_code = 'CUST-'||lpad((1000 + ((i % 20)+1))::text,4,'0')),
  (array['I want to return a product','My order is late','Refund not received','Product is damaged','Cannot login to my account','Subscription renewed twice','Earbuds not connecting','Charged extra for shipping','Tracking not updating','Wrong size delivered'])[((i-1) % 10)+1],
  (array['order','order','billing','order','account','billing','technical','billing','order','order'])[((i-1) % 10)+1],
  jsonb_build_array((array['return','delivery','refund','damaged_item','login','subscription','technical_failure','shipping_charge','tracking','wrong_item'])[((i-1) % 10)+1]),
  (array['low','medium','medium','high','low','medium','medium','low','medium','high'])[((i-1) % 10)+1],
  (array['neutral','negative','negative','negative','neutral','negative','neutral','neutral','neutral','negative'])[((i-1) % 10)+1],
  round((0.3 + (i % 50) / 100.0)::numeric, 2),
  (array['P3','P2','P2','P1','P4','P2','P3','P3','P2','P1'])[((i-1) % 10)+1],
  (array['resolved','resolved','resolved','escalated','resolved','resolved','closed','resolved','resolved','action_required'])[((i-1) % 10)+1],
  (array['order','order','billing','order','account','billing','technical','billing','order','order'])[((i-1) % 10)+1],
  'Routed by specialist match',
  round((0.7 + (i % 25) / 100.0)::numeric, 2),
  now() + (((i % 24) + 2) || ' hours')::interval,
  (array['Return processed','Courier delay','Refund completed','Address mismatch','Session expired','Duplicate subscription','Bluetooth pairing fault','Shipping charge error','Tracking latency','Wrong item sent'])[((i-1) % 10)+1],
  round((0.6 + (i % 30) / 100.0)::numeric, 2),
  case when ((i-1) % 10)+1 = 4 then (60 + (i % 25))::numeric else null end,
  now() - ((i % 20) || ' days')::interval
from generate_series(1, 37) as s(i);

-- ---------------------------------------------------------------------
-- Escalations (3) with Resolution Passports
-- ---------------------------------------------------------------------
insert into public.resolveai_escalations (case_id, score, reasons, recommended_queue, priority, passport, status, created_at) values
((select id from public.resolveai_cases where case_id='CS-5002'), 88.00,
 '["Contradictory evidence: order delivered vs customer claim", "GPS delivery location mismatch", "Repeated contact for same issue"]'::jsonb,
 'Tier-2 Order Investigations', 'P1',
 jsonb_build_object('case_id','CS-5002','customer','Rahul Verma','original_complaint','The courier says delivered but I never received my package.','root_cause_hypothesis','Delivery location mismatch','evidence', jsonb_build_object('order_db','delivered','courier','delivered','gps','location mismatch'),'decision','AUTO-RESOLUTION BLOCKED','recommended_next_action','Investigate courier delivery proof with customer address records'),
 'open', now() - interval '2 hours'),
((select id from public.resolveai_cases where case_id='CS-5003'), 82.00,
 '["Automated refund failed 3 times", "Circuit breaker activated", "Payment gateway refund API unavailable"]'::jsonb,
 'Tier-2 Billing Investigations', 'P2',
 jsonb_build_object('case_id','CS-5003','customer','Ananya Iyer','original_complaint','My refund is not coming through.','action_history', jsonb_build_array('refund_attempt_1 failed','refund_attempt_2 failed','refund_attempt_3 failed'),'circuit_breaker','TRIPPED','recommended_next_action','Manual refund via bank reconciliation'),
 'open', now() - interval '3 hours'),
((select id from public.resolveai_cases where case_id='CS-5020'), 74.00,
 '["Financial impact above Tier-1 authority", "High-value customer with open complaint"]'::jsonb,
 'Manager Review', 'P2',
 jsonb_build_object('case_id','CS-5020','recommended_next_action','Manager approval for refund above automated authority'),
 'open', now() - interval '1 day');

-- ---------------------------------------------------------------------
-- Failure fingerprints (5) & incidents (2)
-- ---------------------------------------------------------------------
insert into public.resolveai_failure_fingerprints (fingerprint_id, name, symptoms, affected_system, probable_root_cause, frequency, severity, recommended_recovery) values
('FP-01', 'Payment/Order Synchronization Failure', '["payment_gateway_timeout","duplicate_transaction","order_still_pending"]'::jsonb, 'payment-order-sync', 'Gateway timeout between bank confirmation and order status update creates duplicate debits', 42, 'high', 'Issue duplicate refund; reconcile order status via order service'),
('FP-02', 'Delivery Location Mismatch', '["courier_claims_delivered","customer_disputes","gps_location_mismatch"]'::jsonb, 'logistics', 'Courier proof-of-delivery GPS does not match the customer home location', 9, 'medium', 'Escalate to courier operations; verify delivery photographs'),
('FP-03', 'Refund API Failure', '["refund_attempt_failed","refund_attempt_failed","refund_attempt_failed"]'::jsonb, 'payment-gateway', 'Refund API unavailable under load', 3, 'critical', 'Circuit breaker tripped; manual refund via bank reconciliation'),
('FP-04', 'Session Loss on Login', '["login_failure","session_expiry"]'::jsonb, 'auth-service', 'Session store eviction under load', 5, 'low', 'Clear cache and re-authenticate'),
('FP-05', 'Late Shipment Escalation', '["order_not_shipped","delivery_late","tracking_stale"]'::jsonb, 'warehouse', 'Warehouse dispatch queue backpressure', 7, 'medium', 'Expedite dispatch; notify customer of revised ETA');

insert into public.resolveai_incidents (incident_id, fingerprint_id, name, status, affected_case_count, first_detected_at, severity, recommended_response) values
('INC-8921', (select id from public.resolveai_failure_fingerprints where fingerprint_id='FP-01'), 'Payment Gateway Duplicate Debits', 'active', 42, now() - interval '7 hours', 'high', 'Monitor duplicate-debit rate; auto-refund verified duplicates; notify affected customers'),
('INC-8902', (select id from public.resolveai_failure_fingerprints where fingerprint_id='FP-02'), 'Delivery GPS Discrepancies', 'investigating', 9, now() - interval '1 day', 'medium', 'Audit courier proof-of-delivery; engage logistics partner');

insert into public.resolveai_incident_cases (incident_id, case_id)
select (select id from public.resolveai_incidents where incident_id='INC-8921'), c.id
from public.resolveai_cases c
where c.intent = 'billing' and c.root_cause like '%payment%'
limit 12;

insert into public.resolveai_incident_cases (incident_id, case_id)
select (select id from public.resolveai_incidents where incident_id='INC-8902'), c.id
from public.resolveai_cases c
where c.root_cause like '%Address mismatch%' or c.root_cause like '%Tracking latency%'
limit 6;

-- ---------------------------------------------------------------------
-- Analytics events (historical, for the analytics dashboards)
-- ---------------------------------------------------------------------
insert into public.resolveai_analytics_events (customer_id, case_id, event_type, payload, created_at)
select
  (select id from public.resolveai_cases c where c.case_id = cid.case_id),
  (select id from public.resolveai_cases c where c.case_id = cid.case_id),
  cid.event_type,
  jsonb_build_object('priority', cid.priority, 'intent', cid.intent),
  now() - (cid.hours || ' hours')::interval
from (values
  ('CS-5001','case_opened','P1','billing',1),
  ('CS-5001','action_executed','P1','billing',1),
  ('CS-5001','action_verified','P1','billing',1),
  ('CS-5001','case_resolved','P1','billing',1),
  ('CS-5002','case_opened','P1','order',2),
  ('CS-5002','contradiction_detected','P1','order',2),
  ('CS-5002','case_escalated','P1','order',2),
  ('CS-5003','case_opened','P2','billing',3),
  ('CS-5003','action_failed','P2','billing',3),
  ('CS-5003','circuit_breaker_tripped','P2','billing',3),
  ('CS-5003','case_escalated','P2','billing',3)
) as cid(case_id, event_type, priority, intent, hours);

-- ---------------------------------------------------------------------
-- Audit logs (sample)
-- ---------------------------------------------------------------------
insert into public.resolveai_audit_logs (case_id, actor, agent, action, input, decision, evidence, policy, authority, risk, result, verification, created_at) values
((select id from public.resolveai_cases where case_id='CS-5001'), 'system', 'supervisor', 'route_case', '{"intent":"billing","confidence":0.96}'::jsonb, '{"specialist":"billing"}'::jsonb, '{"payment_transactions":2}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"routed":true}'::jsonb, '{}'::jsonb, now() - interval '34 minutes'),
((select id from public.resolveai_cases where case_id='CS-5001'), 'system', 'billing', 'issue_refund', '{"amount":2499,"payment":"TXN-P10002"}'::jsonb, '{"gates":"PASS"}'::jsonb, '{"duplicate":true}'::jsonb, '{"policy":"POL-REF-01","allowed":true}'::jsonb, '{"limit":5000,"within":true}'::jsonb, '{"risk":"low","gate":"PASS"}'::jsonb, '{"refund":"RF-0009","status":"issued"}'::jsonb, '{"overall":"passed"}'::jsonb, now() - interval '28 minutes'),
((select id from public.resolveai_cases where case_id='CS-5002'), 'system', 'order', 'detect_contradiction', '{}'::jsonb, '{"blocked":true}'::jsonb, '{"order_db":"delivered","courier":"delivered","gps":"mismatch"}'::jsonb, '{"policy":"POL-SHIP-01","allowed":false}'::jsonb, '{}'::jsonb, '{"risk":"review","gate":"REVIEW"}'::jsonb, '{"escalated":true}'::jsonb, '{}'::jsonb, now() - interval '1 hour'),
((select id from public.resolveai_cases where case_id='CS-5003'), 'system', 'billing', 'issue_refund', '{"attempt":3}'::jsonb, '{"breaker":"TRIPPED"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"error":"refund_api_unavailable"}'::jsonb, '{}'::jsonb, now() - interval '2 hours');
