// UserService.js - Modified version with various changes
// This file demonstrates various types of changes for diff viewer testing

import { Database } from './database';
import { Logger } from './logger';
import { EmailValidator, PasswordValidator, PhoneValidator } from './validators';
import { CacheManager } from './cache';
import { EventEmitter } from './events';

function hello() {
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
  console.log('Hello, world!');
}

/**
 * UserService handles all user-related operations including authentication,
 * profile management, permissions, and role-based access control (RBAC)
 */
class UserService extends EventEmitter {
  constructor(database, logger, options = {}) {
    super();
    this.db = database;
    this.log = logger;
    this.cache = new CacheManager({ ttl: options.cacheTTL || 3600 });
    this.maxLoginAttempts = options.maxLoginAttempts || 5;
    this.loginAttempts = new Map();
  }

  /**
   * Authenticates a user with email and password, includes rate limiting
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @param {string} ipAddress - Client IP for rate limiting
   * @returns {Promise<{user: User, token: string}>} Authenticated user object with session token
   * @throws {Error} If authentication fails or rate limit exceeded
   */
  async authenticateUser(email, password, ipAddress = null) {
    if (!EmailValidator.validate(email)) {
      throw new Error('Invalid email address format');
    }

    // Check rate limiting
    if (ipAddress && this.isRateLimited(ipAddress)) {
      this.log.warn(`Rate limit exceeded for IP: ${ipAddress}`);
      throw new Error('Too many login attempts. Please try again later.');
    }

    const user = await this.db.findUserByEmail(email);
    if (!user) {
      this.incrementLoginAttempts(ipAddress);
      throw new Error('Invalid credentials');
    }

    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      this.incrementLoginAttempts(ipAddress);
      throw new Error('Invalid credentials');
    }

    this.resetLoginAttempts(ipAddress);
    const sessionToken = await this.createSession(user.id);
    this.emit('user:authenticated', { userId: user.id, email });
    this.log.info(`User authenticated successfully: ${email} from IP ${ipAddress}`);
    return { user, token: sessionToken };
  }

  /**
   * Creates a new user account with email verification
   */
  async createUser(userData) {
    const { email, password, name, role, phone, metadata } = userData;

    if (!EmailValidator.validate(email)) {
      throw new Error('Invalid email address format');
    }

    if (!PasswordValidator.validate(password)) {
      throw new Error('Password must be at least 12 characters with uppercase, lowercase, numbers, and special characters');
    }

    if (phone && !PhoneValidator.validate(phone)) {
      throw new Error('Invalid phone number format');
    }

    const existingUser = await this.db.findUserByEmail(email);
    if (existingUser) {
      throw new Error('An account with this email already exists');
    }

    const passwordHash = await this.hashPassword(password);
    const verificationToken = this.generateVerificationToken();

    const newUser = {
      email,
      name,
      phone: phone || null,
      role: role || 'user',
      passwordHash,
      emailVerified: false,
      verificationToken,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const userId = await this.db.insertUser(newUser);
    await this.sendVerificationEmail(email, verificationToken);
    this.emit('user:created', { userId, email });
    this.log.info(`New user account created: ${email} with role ${role || 'user'}`);

    return { ...newUser, id: userId };
  }

  /**
   * Updates user profile information with validation
   */
  async updateUserProfile(userId, updates) {
    const user = await this.db.findUserById(userId);
    if (!user) {
      throw new Error('User account not found');
    }

    const allowedFields = ['name', 'email', 'phone', 'avatar', 'bio'];
    const filteredUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    if (filteredUpdates.email && filteredUpdates.email !== user.email) {
      if (!EmailValidator.validate(filteredUpdates.email)) {
        throw new Error('Invalid email address format');
      }
      const existingUser = await this.db.findUserByEmail(filteredUpdates.email);
      if (existingUser && existingUser.id !== userId) {
        throw new Error('This email address is already registered to another account');
      }
      filteredUpdates.emailVerified = false;
      filteredUpdates.verificationToken = this.generateVerificationToken();
    }

    if (filteredUpdates.phone) {
      if (!PhoneValidator.validate(filteredUpdates.phone)) {
        throw new Error('Invalid phone number format');
      }
    }

    filteredUpdates.updatedAt = new Date().toISOString();
    await this.db.updateUser(userId, filteredUpdates);
    this.cache.delete(userId);
    this.emit('user:updated', { userId, updates: filteredUpdates });
    this.log.info(`User profile updated successfully: ${userId}`);

    return { ...user, ...filteredUpdates };
  }

  /**
   * Soft deletes a user account (marks as deleted but retains data)
   */
  async deleteUser(userId, permanent = false) {
    const user = await this.db.findUserById(userId);
    if (!user) {
      throw new Error('User account not found');
    }

    if (permanent) {
      await this.db.deleteUser(userId);
      this.log.warn(`User permanently deleted: ${userId}`);
    } else {
      await this.db.updateUser(userId, {
        deletedAt: new Date().toISOString(),
        active: false
      });
      this.log.info(`User soft deleted: ${userId}`);
    }

    this.cache.delete(userId);
    this.emit('user:deleted', { userId, permanent });

    return { success: true, permanent };
  }

  /**
   * Gets user by ID with caching and TTL
   */
  async getUserById(userId, options = {}) {
    const cacheKey = `user:${userId}`;

    if (!options.skipCache && this.cache.has(cacheKey)) {
      this.log.debug(`Cache hit for user: ${userId}`);
      return this.cache.get(cacheKey);
    }

    const user = await this.db.findUserById(userId);
    if (user && !options.skipCache) {
      this.cache.set(cacheKey, user);
    }

    return user;
  }

  /**
   * Changes user password with strength validation
   */
  async changePassword(userId, oldPassword, newPassword) {
    const user = await this.db.findUserById(userId);
    if (!user) {
      throw new Error('User account not found');
    }

    const isValid = await this.verifyPassword(oldPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    if (!PasswordValidator.validate(newPassword)) {
      throw new Error('New password must be at least 12 characters with uppercase, lowercase, numbers, and special characters');
    }

    if (oldPassword === newPassword) {
      throw new Error('New password must be different from current password');
    }

    const newPasswordHash = await this.hashPassword(newPassword);
    await this.db.updateUser(userId, {
      passwordHash: newPasswordHash,
      passwordChangedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    this.emit('user:password_changed', { userId });
    this.log.info(`Password changed successfully for user: ${userId}`);

    return { success: true };
  }

  /**
   * Lists all users with pagination and filtering
   */
  async listUsers(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    const users = await this.db.findAllUsers(limit, offset, filters);
    const total = await this.db.countUsers(filters);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Searches users by name or email with fuzzy matching
   */
  async searchUsers(query, options = {}) {
    const limit = options.limit || 50;
    const users = await this.db.searchUsers(query, { fuzzy: true, limit });
    this.log.debug(`Search performed: "${query}" returned ${users.length} results`);
    return users;
  }

  /**
   * Helper: Hash password using bcrypt
   */
  async hashPassword(password) {
    const bcrypt = await import('bcrypt');
    return bcrypt.hash(password, 12);
  }

  /**
   * Helper: Verify password against hash
   */
  async verifyPassword(password, hash) {
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(password, hash);
  }

  /**
   * Helper: Generate email verification token
   */
  generateVerificationToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  /**
   * Helper: Send verification email
   */
  async sendVerificationEmail(email, token) {
    // Implementation would send actual email
    this.log.info(`Verification email sent to: ${email}`);
  }

  /**
   * Helper: Create session token
   */
  async createSession(userId) {
    return `session_${userId}_${Date.now()}`;
  }

  /**
   * Helper: Check if IP is rate limited
   */
  isRateLimited(ipAddress) {
    const attempts = this.loginAttempts.get(ipAddress) || 0;
    return attempts >= this.maxLoginAttempts;
  }

  /**
   * Helper: Increment login attempts
   */
  incrementLoginAttempts(ipAddress) {
    if (!ipAddress) return;
    const attempts = (this.loginAttempts.get(ipAddress) || 0) + 1;
    this.loginAttempts.set(ipAddress, attempts);
  }

  /**
   * Helper: Reset login attempts
   */
  resetLoginAttempts(ipAddress) {
    if (ipAddress) {
      this.loginAttempts.delete(ipAddress);
    }
  }

  /**
   * Helper: Clear all caches
   */
  clearCache() {
    this.cache.clear();
    this.log.info('All user caches cleared');
  }
}

export default UserService;
