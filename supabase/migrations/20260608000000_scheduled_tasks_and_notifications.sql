CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS nh_scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    cron_expr TEXT,
    prompt TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nh_user_todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    task TEXT,
    status TEXT DEFAULT 'pending',
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nh_user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE nh_scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE nh_user_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE nh_user_notifications ENABLE ROW LEVEL SECURITY;

-- nh_scheduled_tasks policies
CREATE POLICY "Users can view their own scheduled tasks" ON nh_scheduled_tasks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled tasks" ON nh_scheduled_tasks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled tasks" ON nh_scheduled_tasks
    FOR DELETE USING (auth.uid() = user_id);

-- nh_user_todos policies
CREATE POLICY "Users can view their own todos" ON nh_user_todos
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own todos" ON nh_user_todos
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own todos" ON nh_user_todos
    FOR DELETE USING (auth.uid() = user_id);

-- nh_user_notifications policies
CREATE POLICY "Users can view their own notifications" ON nh_user_notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON nh_user_notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications" ON nh_user_notifications
    FOR DELETE USING (auth.uid() = user_id);

-- Grants
GRANT ALL ON nh_scheduled_tasks TO service_role;
GRANT SELECT, UPDATE, DELETE ON nh_scheduled_tasks TO authenticated;

GRANT ALL ON nh_user_todos TO service_role;
GRANT SELECT, UPDATE, DELETE ON nh_user_todos TO authenticated;

GRANT ALL ON nh_user_notifications TO service_role;
GRANT SELECT, UPDATE, DELETE ON nh_user_notifications TO authenticated;
