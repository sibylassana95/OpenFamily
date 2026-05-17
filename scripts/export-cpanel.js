/**
 * Génère un fichier SQL compatible cPanel PostgreSQL 9.6
 * - UUID générés en JavaScript (pas de dépendance à uuid-ossp ou gen_random_uuid)
 * - EXECUTE PROCEDURE au lieu de EXECUTE FUNCTION
 * - Pas de DEFAULT uuid_generate_v4() dans le schéma (valeur fournie à l'INSERT)
 * Usage: node scripts/export-cpanel.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Charger le .env
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim();
    });

const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'openfamily',
    user: process.env.POSTGRES_USER || 'openfamily',
    password: process.env.POSTGRES_PASSWORD,
});

// Tables dans l'ordre des dépendances (FK)
const TABLES = [
    'users',
    'family_members',
    'shopping_items',
    'shopping_list_templates',
    'tasks',
    'appointments',
    'schedule_entries',
    'recipes',
    'meal_plans',
    'budget_entries',
    'budget_limits',
    'notifications',
    'push_subscriptions',
    'vacations',
    'vacation_itinerary',
    'vacation_luggage',
    'vacation_participants',
    'house_rooms',
    'house_items',
    'house_equipments',
    'house_contracts',
    'house_contacts',
    'house_documents',
    'house_maintenance',
    'house_projects',
    'ai_conversations',
    'ai_messages',
    'ai_interactions',
    'ai_classification_cache',
    'pgmigrations',
];

function escapeVal(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return String(val);
    if (val instanceof Date) return `'${val.toISOString()}'`;
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    return `'${String(val).replace(/'/g, "''")}'`;
}

async function main() {
    const out = [];

    out.push('-- KeurSIBY — Export complet compatible cPanel');
    out.push('-- Généré le ' + new Date().toISOString());
    out.push('-- PostgreSQL compatible (sans uuid-ossp, sans EXECUTE FUNCTION)');
    out.push('');
    out.push("SET client_encoding = 'UTF8';");
    out.push('SET standard_conforming_strings = on;');
    out.push('');

    // ── SCHÉMA ──────────────────────────────────────────────────────────────
    out.push('-- ============================================================');
    out.push('-- SCHÉMA');
    out.push('-- ============================================================');
    out.push('');

    out.push(`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    currency VARCHAR(10) DEFAULT 'XOF',
    locale VARCHAR(10) DEFAULT 'fr',
    timezone VARCHAR(50) DEFAULT 'UTC',
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS family_members (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Autre',
    birth_date DATE,
    color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
    blood_type VARCHAR(3),
    allergies TEXT,
    medications TEXT,
    vaccines TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact TEXT,
    notes TEXT,
    medical_notes TEXT,
    avatar_url TEXT,
    dietary_preferences JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS shopping_items (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    quantity DECIMAL(10,2),
    unit VARCHAR(50),
    price DECIMAL(10,2),
    is_checked BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS shopping_list_templates (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    items JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    due_date TIMESTAMP,
    frequency VARCHAR(50),
    priority VARCHAR(50),
    assigned_to JSONB DEFAULT '[]'::jsonb,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    location TEXT,
    family_member_ids JSONB DEFAULT '[]'::jsonb,
    reminder_30min BOOLEAN DEFAULT FALSE,
    reminder_1hour BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS schedule_entries (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    schedule_type VARCHAR(30) NOT NULL DEFAULT 'work',
    title VARCHAR(255) NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    specific_date DATE,
    location TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    ingredients JSONB NOT NULL,
    instructions JSONB NOT NULL,
    prep_time INTEGER,
    cook_time INTEGER,
    servings INTEGER,
    difficulty VARCHAR(50),
    tags JSONB,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS meal_plans (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    meal_type VARCHAR(50) NOT NULL,
    recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
    custom_meal TEXT,
    notes TEXT,
    lunchbox_enabled BOOLEAN DEFAULT FALSE,
    lunchbox_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date, meal_type)
);`);

    out.push(`CREATE TABLE IF NOT EXISTS budget_entries (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    is_expense BOOLEAN DEFAULT TRUE,
    assigned_to UUID REFERENCES family_members(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS budget_limits (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    monthly_limit DECIMAL(10,2) NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category, month, year)
);`);

    out.push(`CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    keys JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint)
);`);

    out.push(`CREATE TABLE IF NOT EXISTS vacations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    destination VARCHAR(255),
    start_date DATE,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'planned',
    notes TEXT,
    budget DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS vacation_itinerary (
    id UUID PRIMARY KEY,
    vacation_id UUID NOT NULL REFERENCES vacations(id) ON DELETE CASCADE,
    day_number INTEGER,
    date DATE,
    title VARCHAR(255),
    description TEXT,
    location VARCHAR(255),
    activity_type VARCHAR(50),
    start_time TIME,
    end_time TIME,
    cost DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS vacation_luggage (
    id UUID PRIMARY KEY,
    vacation_id UUID NOT NULL REFERENCES vacations(id) ON DELETE CASCADE,
    category VARCHAR(100),
    item_name VARCHAR(255) NOT NULL,
    quantity INTEGER DEFAULT 1,
    is_packed BOOLEAN DEFAULT FALSE,
    assigned_to UUID REFERENCES family_members(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS vacation_participants (
    vacation_id UUID NOT NULL REFERENCES vacations(id) ON DELETE CASCADE,
    family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    PRIMARY KEY (vacation_id, family_member_id)
);`);

    out.push(`CREATE TABLE IF NOT EXISTS house_rooms (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50),
    floor INTEGER DEFAULT 0,
    area DECIMAL(8,2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS house_items (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES house_rooms(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    brand VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100),
    purchase_date DATE,
    purchase_price DECIMAL(10,2),
    warranty_end DATE,
    condition VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS house_equipments (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES house_rooms(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    brand VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100),
    installation_date DATE,
    last_maintenance DATE,
    next_maintenance DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS house_contracts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    provider VARCHAR(255),
    contract_number VARCHAR(100),
    start_date DATE,
    end_date DATE,
    amount DECIMAL(10,2),
    frequency VARCHAR(50),
    auto_renewal BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS house_contacts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100),
    company VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS house_documents (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    file_name VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    storage_key TEXT,
    related_type VARCHAR(50),
    related_id UUID,
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS house_maintenance (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'planned',
    priority VARCHAR(50),
    scheduled_date DATE,
    completed_date DATE,
    cost DECIMAL(10,2),
    provider VARCHAR(255),
    room_id UUID REFERENCES house_rooms(id) ON DELETE SET NULL,
    equipment_id UUID REFERENCES house_equipments(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS house_projects (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'planned',
    priority VARCHAR(50),
    start_date DATE,
    end_date DATE,
    budget DECIMAL(10,2),
    actual_cost DECIMAL(10,2),
    room_id UUID REFERENCES house_rooms(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    context_type VARCHAR(50),
    context_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    tokens_used INTEGER,
    model VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS ai_interactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature VARCHAR(100) NOT NULL,
    model VARCHAR(100),
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);

    out.push(`CREATE TABLE IF NOT EXISTS ai_classification_cache (
    id UUID PRIMARY KEY,
    input_hash VARCHAR(64) UNIQUE NOT NULL,
    input_text TEXT NOT NULL,
    classification_type VARCHAR(50) NOT NULL,
    result JSONB NOT NULL,
    model VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);`);

    // Indexes
    out.push('');
    out.push('-- Index');
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON family_members(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_shopping_items_user_id ON shopping_items(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_shopping_items_category ON shopping_items(category);',
        'CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);',
        'CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks USING GIN (assigned_to);',
        'CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON appointments(start_time);',
        'CREATE INDEX IF NOT EXISTS idx_schedule_entries_user_day ON schedule_entries(user_id, day_of_week);',
        'CREATE INDEX IF NOT EXISTS idx_schedule_entries_member ON schedule_entries(family_member_id);',
        'CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);',
        'CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON meal_plans(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_meal_plans_date ON meal_plans(date);',
        'CREATE INDEX IF NOT EXISTS idx_budget_entries_user_id ON budget_entries(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_budget_entries_date ON budget_entries(date);',
        'CREATE INDEX IF NOT EXISTS idx_budget_entries_category ON budget_entries(category);',
        'CREATE INDEX IF NOT EXISTS idx_budget_entries_assigned_to ON budget_entries(assigned_to);',
        'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);',
        'CREATE INDEX IF NOT EXISTS idx_vacations_user_id ON vacations(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_vacation_itinerary_vacation_id ON vacation_itinerary(vacation_id);',
        'CREATE INDEX IF NOT EXISTS idx_vacation_luggage_vacation_id ON vacation_luggage(vacation_id);',
        'CREATE INDEX IF NOT EXISTS idx_vacation_participants_member ON vacation_participants(family_member_id);',
        'CREATE INDEX IF NOT EXISTS idx_ai_interactions_user_id ON ai_interactions(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_ai_interactions_feature ON ai_interactions(feature);',
        'CREATE INDEX IF NOT EXISTS idx_ai_classification_cache_hash ON ai_classification_cache(input_hash);',
        'CREATE INDEX IF NOT EXISTS idx_ai_classification_cache_expires ON ai_classification_cache(expires_at);',
    ];
    indexes.forEach((i) => out.push(i));

    // Trigger function + triggers
    out.push('');
    out.push('-- Fonction et triggers updated_at');
    out.push(`CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';`);

    const triggerTables = [
        'users',
        'family_members',
        'shopping_items',
        'shopping_list_templates',
        'tasks',
        'appointments',
        'schedule_entries',
        'recipes',
        'meal_plans',
        'budget_entries',
        'budget_limits',
        'notifications',
        'vacations',
        'vacation_itinerary',
        'vacation_luggage',
        'house_rooms',
        'house_items',
        'house_equipments',
        'house_contracts',
        'house_contacts',
        'house_documents',
        'house_maintenance',
        'house_projects',
        'ai_conversations',
    ];
    triggerTables.forEach((t) => {
        out.push(`DROP TRIGGER IF EXISTS update_${t}_updated_at ON ${t};`);
        out.push(
            `CREATE TRIGGER update_${t}_updated_at BEFORE UPDATE ON ${t} FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();`,
        );
    });

    // ── DONNÉES ──────────────────────────────────────────────────────────────
    out.push('');
    out.push('-- ============================================================');
    out.push('-- DONNÉES');
    out.push('-- ============================================================');
    out.push('');

    const client = await pool.connect();
    try {
        for (const table of TABLES) {
            // Vérifier si la table existe localement
            const exists = await client.query(
                `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
                [table],
            );
            if (exists.rows.length === 0) {
                console.log(`SKIP (inexistante): ${table}`);
                continue;
            }

            const result = await client
                .query(`SELECT * FROM ${table} ORDER BY created_at ASC NULLS LAST`)
                .catch(() => client.query(`SELECT * FROM ${table}`));

            if (result.rows.length === 0) {
                console.log(`VIDE: ${table}`);
                continue;
            }

            out.push(`-- Table: ${table} (${result.rows.length} lignes)`);
            const cols = result.fields.map((f) => f.name);

            for (const row of result.rows) {
                const vals = cols.map((c) => escapeVal(row[c]));
                out.push(
                    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;`,
                );
            }
            out.push('');
            console.log(`OK: ${table} — ${result.rows.length} lignes`);
        }
    } finally {
        client.release();
        await pool.end();
    }

    const sql = out.join('\n');
    const outPath = path.join(__dirname, '..', 'keursiby-cpanel-full.sql');
    fs.writeFileSync(outPath, sql, 'utf8');
    console.log(
        `\n✅ Fichier généré: keursiby-cpanel-full.sql (${Math.round(sql.length / 1024)}KB)`,
    );
    console.log('Importer sur cPanel avec:');
    console.log(
        '  psql -U mivo8940_siby -d mivo8940_keursiby -h localhost -f keursiby-cpanel-full.sql',
    );
}

main().catch((err) => {
    console.error('Erreur:', err.message);
    process.exit(1);
});
