-- مخزون تجريبي للتطوير المحلي. في الإنتاج يأتي من نظام المستودعات (WMS).
INSERT INTO stock_items (sku, warehouse_id, on_hand, reserved) VALUES
    ('N-APL-IP15-128-BLK',  'DXB-1', 120, 0),
    ('N-APL-IP15-256-BLU',  'DXB-1',  80, 0),
    ('N-SAM-S24-256-GRY',   'DXB-1',  95, 0),
    ('N-SAM-S24U-512-TTN',  'DXB-1',  40, 0),
    ('N-APL-MBA-M3-256',    'DXB-1',  35, 0),
    ('N-SON-WH1000XM5-BLK', 'DXB-1', 210, 0),
    ('N-APL-AIRPODS-PRO2',  'DXB-1', 300, 0),
    ('N-LG-OLED55C4',       'AUH-1',  18, 0),
    ('N-DYS-V15-DETECT',    'DXB-1',  26, 0),
    ('N-NIK-AIRMAX270-42',  'DXB-1', 150, 0),
    ('N-ADI-ULTRA22-43',    'DXB-1', 140, 0),
    ('N-LOR-REV-SERUM-30',  'DXB-1', 400, 0),
    ('N-PSN-PS5-SLIM-DE',   'DXB-1',  12, 0),
    ('N-XBX-SERIESX-1TB',   'DXB-1',  15, 0),
    ('N-IKE-DESK-140',      'AUH-1',  60, 0),
    ('N-NES-VERTUO-POP',    'DXB-1',  75, 0)
ON CONFLICT (sku) DO NOTHING;
