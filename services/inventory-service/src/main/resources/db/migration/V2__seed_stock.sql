-- ============================================================================
--  مخزون تجريبي. في الإنتاج يأتي من نظام المستودعات (WMS).
--
--  محكوم بعلامة ${seedDemoData} كبقية بيانات العرض، والافتراضي false:
--  بذر مخزون وهمي في الإنتاج يعني بيع ما لا نملك — وهو عطل يظهر عند العميل
--  لا في السجلات.
--
--  رموز المستودعات مصرية (CAI = القاهرة، ALX = الإسكندرية) لأن المتجر يخدم
--  مصر ويسعّر بالجنيه.
-- ============================================================================

INSERT INTO stock_items (sku, warehouse_id, on_hand, reserved)
SELECT v.sku, v.warehouse_id, v.on_hand, v.reserved
FROM (VALUES
    ('TC-APL-IP15-128-BLK',  'CAI-1', 120, 0),
    ('TC-APL-IP15-256-BLU',  'CAI-1',  80, 0),
    ('TC-SAM-S24-256-GRY',   'CAI-1',  95, 0),
    ('TC-SAM-S24U-512-TTN',  'CAI-1',  40, 0),
    ('TC-APL-MBA-M3-256',    'CAI-1',  35, 0),
    ('TC-SON-WH1000XM5-BLK', 'CAI-1', 210, 0),
    ('TC-APL-AIRPODS-PRO2',  'CAI-1', 300, 0),
    ('TC-LG-OLED55C4',       'ALX-1',  18, 0),
    ('TC-DYS-V15-DETECT',    'CAI-1',  26, 0),
    ('TC-NIK-AIRMAX270-42',  'CAI-1', 150, 0),
    ('TC-ADI-ULTRA22-43',    'CAI-1', 140, 0),
    ('TC-LOR-REV-SERUM-30',  'CAI-1', 400, 0),
    ('TC-PSN-PS5-SLIM-DE',   'CAI-1',  12, 0),
    ('TC-XBX-SERIESX-1TB',   'CAI-1',  15, 0),
    ('TC-IKE-DESK-140',      'ALX-1',  60, 0),
    ('TC-NES-VERTUO-POP',    'CAI-1',  75, 0)
) AS v(sku, warehouse_id, on_hand, reserved)
WHERE '${seedDemoData}' = 'true'
ON CONFLICT (sku) DO NOTHING;
