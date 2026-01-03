import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { nanoid } from 'nanoid';
import {
    createUser,
    getUserByEmail,
    getUserById,
    updateUserLogin,
    updateUserPoints,
    saveAnalysis,
    getAnalysesByUserId,
    deleteAnalysis
} from './database.js';
import { hashPassword, verifyPassword, signToken, requireAuth, getTokenFromReq, verifyToken } from './auth.js';

const PORT = 3001; // Backend Port
const JWT_SECRET = 'life-k-line-insight-secret-key-2025';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(cors());

// Auth Middleware Helper
const getAuthedUser = (req) => {
    const token = getTokenFromReq(req);
    if (!token) return null;
    try {
        const decoded = verifyToken(token, JWT_SECRET);
        return getUserById(decoded.sub);
    } catch {
        return null;
    }
};

// ============ Auth Routes ============

app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) return res.status(400).json({ error: 'INVALID_INPUT' });

    const existing = getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'EMAIL_EXISTS' });

    const passwordHash = await hashPassword(password);
    const user = createUser(nanoid(), email, passwordHash, 10); // Register gives 10 points

    const token = signToken({ sub: user.id, email: user.email }, JWT_SECRET);
    res.cookie('token', token, { httpOnly: true });
    return res.json({ user: { id: user.id, email: user.email, points: user.points, role: user.role } });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = getUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    updateUserLogin(user.id);
    const token = signToken({ sub: user.id, email: user.email }, JWT_SECRET);
    res.cookie('token', token, { httpOnly: true });
    return res.json({ user: { id: user.id, email: user.email, points: user.points, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
    const user = getAuthedUser(req);
    if (!user) return res.json({ user: null });
    return res.json({ user: { id: user.id, email: user.email, points: user.points, role: user.role } });
});

// ============ Data Routes ============

app.get('/api/history', requireAuth(JWT_SECRET), (req, res) => {
    const list = getAnalysesByUserId(req.auth.sub);
    res.json({ items: list });
});

app.post('/api/analysis/save', (req, res) => {
    const user = getAuthedUser(req);
    const { bazi, chartData, analysisData, cost } = req.body;

    if (user) {
        // Registered User
        if (user.points < (cost || 0)) {
            return res.status(402).json({ error: 'INSUFFICIENT_POINTS' });
        }
        // Deduct points
        if (cost > 0) {
            updateUserPoints(user.id, user.points - cost);
        }

        saveAnalysis({
            id: nanoid(),
            userId: user.id,
            cost: cost || 0,
            bazi,
            chartData,
            analysisData
        });

        return res.json({ ok: true, points: user.points - (cost || 0) });
    } else {
        // Guest User (No points deduction, but also maybe no permanent storage retrieval for them later easily)
        // We still save it to DB potentially with null userId if we want to track stats, 
        // or we can allow saving with userId null.
        saveAnalysis({
            id: nanoid(),
            userId: null,
            cost: 0,
            bazi,
            chartData,
            analysisData
        });
        return res.json({ ok: true, points: 0 });
    }
});

app.post('/api/analysis/delete', requireAuth(JWT_SECRET), (req, res) => {
    const { id } = req.body;
    deleteAnalysis(id, req.auth.sub);
    res.json({ ok: true });
});

// Points Share Reward
app.post('/api/points/share', requireAuth(JWT_SECRET), (req, res) => {
    const user = getAuthedUser(req);
    const newPoints = user.points + 10;
    updateUserPoints(user.id, newPoints);
    res.json({ points: newPoints });
});

// Points Top-up Mock
app.post('/api/points/add', requireAuth(JWT_SECRET), (req, res) => {
    const user = getAuthedUser(req);
    const newPoints = user.points + 100;
    updateUserPoints(user.id, newPoints);
    res.json({ points: newPoints });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
