// UserService.js - Original version
// This file demonstrates various types of changes for diff viewer testing

import { Database } from './database';
import { Logger } from './logger';
import { validateEmail, validatePassword } from './validators';

/**
 * UserService handles all user-related operations
 * including authentication, profile management, and permissions
 */
class UserService {
  constructor(database, logger) {
    this.db = database;
    this.log = logger;
    this.cache = new Map();
  }

  /**
   * Authenticates a user with email and password
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @returns {Promise<User>} Authenticated user object
   */
  async authenticateUser(email, password) {
    if (!validateEmail(email)) {
      throw new Error('Invalid email format');
    }

    const user = await this.db.findUserByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid password');
    }

    this.log.info(`User authenticated: ${email}`);
    return user;
  }

  /**
   * Creates a new user account
   */
  async createUser(userData) {
    const { email, password, name, role } = userData;

    if (!validateEmail(email)) {
      throw new Error('Invalid email format');
    }

    if (!validatePassword(password)) {
      throw new Error('Password does not meet requirements');
    }

    const existingUser = await this.db.findUserByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const passwordHash = await this.hashPassword(password);
    const newUser = {
      email,
      name,
      role: role || 'user',
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const userId = await this.db.insertUser(newUser);
    this.log.info(`New user created: ${email}`);

    return { ...newUser, id: userId };
  }

  /**
   * Updates user profile information
   */
  async updateUserProfile(userId, updates) {
    const user = await this.db.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const allowedFields = ['name', 'email', 'phone'];
    const filteredUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    if (filteredUpdates.email && filteredUpdates.email !== user.email) {
      if (!validateEmail(filteredUpdates.email)) {
        throw new Error('Invalid email format');
      }
      const existingUser = await this.db.findUserByEmail(filteredUpdates.email);
      if (existingUser) {
        throw new Error('Email already in use');
      }
    }

    filteredUpdates.updatedAt = new Date();
    await this.db.updateUser(userId, filteredUpdates);
    this.log.info(`User profile updated: ${userId}`);

    return { ...user, ...filteredUpdates };
  }

  /**
   * Deletes a user account
   */
  async deleteUser(userId) {
    const user = await this.db.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await this.db.deleteUser(userId);
    this.cache.delete(userId);
    this.log.info(`User deleted: ${userId}`);

    return { success: true };
  }

  /**
   * Gets user by ID with caching
   */
  async getUserById(userId) {
    if (this.cache.has(userId)) {
      return this.cache.get(userId);
    }

    const user = await this.db.findUserById(userId);
    if (user) {
      this.cache.set(userId, user);
    }

    return user;
  }

  /**
   * Changes user password
   */
  async changePassword(userId, oldPassword, newPassword) {
    const user = await this.db.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await this.verifyPassword(oldPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    if (!validatePassword(newPassword)) {
      throw new Error('New password does not meet requirements');
    }

    const newPasswordHash = await this.hashPassword(newPassword);
    await this.db.updateUser(userId, { passwordHash: newPasswordHash, updatedAt: new Date() });
    this.log.info(`Password changed for user: ${userId}`);

    return { success: true };
  }

  /**
   * Lists all users with pagination
   */
  async listUsers(page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const users = await this.db.findAllUsers(limit, offset);
    const total = await this.db.countUsers();

    return {
      users,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Searches users by name or email
   */
  async searchUsers(query) {
    const users = await this.db.searchUsers(query);
    return users;
  }

  /**
   * Helper: Hash password
   */
  async hashPassword(password) {
    // Simplified - in production use bcrypt
    return Buffer.from(password).toString('base64');
  }

  /**
   * Helper: Verify password
   */
  async verifyPassword(password, hash) {
    const testHash = await this.hashPassword(password);
    return testHash === hash;
  }

  /**
   * Helper: Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.log.info('User cache cleared');
  }
}

export default UserService;
