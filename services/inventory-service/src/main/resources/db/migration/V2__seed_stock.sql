-- مخزون تجريبي للتطوير المحلي. في الإنتاج يأتي من نظام المستودعات (WMS).
INSERT INTO stock_items (sku, warehouse_id, on_hand, reserved) VALUES
    ('TC-APL-IP15-128-BLK',  'DXB-1', 120, 0),
    ('TC-APL-IP15-256-BLU',  'DXB-1',  80, 0),
    ('TC-SAM-S24-256-GRY',   'DXB-1',  95, 0),
    ('TC-SAM-S24U-512-TTN',  'DXB-1',  40, 0),
    ('TC-APL-MBA-M3-256',    'DXB-1',  35, 0),
    ('TC-SON-WH1000XM5-BLK', 'DXB-1', 210, 0),
    ('TC-APL-AIRPODS-PRO2',  'DXB-1', 300, 0),
    ('TC-LG-OLED55C4',       'AUH-1',  18, 0),
    ('TC-DYS-V15-DETECT',    'DXB-1',  26, 0),
    ('TC-NIK-AIRMAX270-42',  'DXB-1', 150, 0),
    ('TC-ADI-ULTRA22-43',    'DXB-1', 140, 0),
    ('TC-LOR-REV-SERUM-30',  'DXB-1', 400, 0),
    ('TC-PSN-PS5-SLIM-DE',   'DXB-1',  12, 0),
    ('TC-XBX-SERIESX-1TB',   'DXB-1',  15, 0),
    ('TC-IKE-DESK-140',      'AUH-1',  60, 0),
    ('TC-NES-VERTUO-POP',    'DXB-1',  75, 0)
ON CONFLICT (sku) DO NOTHING;
