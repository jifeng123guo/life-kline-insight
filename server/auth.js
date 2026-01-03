import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const hashPassword = async (password) => bcrypt.hash(password, 10);

export const verifyPassword = async (password, passwordHash) => bcrypt.compare(password, passwordHash);

export const signToken = (payload, secret) => jwt.sign(payload, secret, { expiresIn: '30d' });

export const verifyToken = (token, secret) => jwt.verify(token, secret);

export const getTokenFromReq = (req) => {
    const header = req.headers.authorization;
    if (header && header.toLowerCase().startsWith('bearer ')) return header.slice(7);
    if (req.cookies?.token) return req.cookies.token;
    return null;
};

export const requireAuth = (secret) => (req, res, next) => {
    try {
        const token = getTokenFromReq(req);
        if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
        const decoded = verifyToken(token, secret);
        req.auth = decoded;
        return next();
    } catch {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
};
