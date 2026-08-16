-- مستخدم تجريبي للتطوير المحلي فقط.
-- كلمة المرور: Passw0rd!  (BCrypt cost 10)
INSERT INTO users (id, email, phone, password_hash, full_name, locale, email_verified, status)
VALUES ('11111111-1111-1111-1111-111111111111',
        'demo@noon.local',
        '+971500000001',
        '$2a$10$4IYf.EQ3NNkB4hdgUrlbfu/SJKs3KJXJZdDWrUzcyoShWU6itSH9y',
        'Demo Customer', 'ar', TRUE, 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role)
VALUES ('11111111-1111-1111-1111-111111111111', 'CUSTOMER')
ON CONFLICT DO NOTHING;

INSERT INTO addresses (user_id, label, full_name, phone, line1, area, city, country, is_default)
VALUES ('11111111-1111-1111-1111-111111111111', 'home', 'Demo Customer', '+971500000001',
        'Sheikh Zayed Road, Tower 1, Apt 1204', 'Business Bay', 'Dubai', 'AE', TRUE)
ON CONFLICT DO NOTHING;
