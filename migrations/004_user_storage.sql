-- 004_user_storage.sql - create user_storage view
CREATE OR REPLACE VIEW user_storage AS
SELECT 
    user_id, 
    COALESCE(SUM(size_bytes), 0) AS total_storage_bytes
FROM assets
WHERE deleted_at IS NULL
GROUP BY user_id;
