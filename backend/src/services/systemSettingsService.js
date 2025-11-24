const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

/**
 * System Settings Service
 * Manages global system configuration
 */
class SystemSettingsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache
    this.lastCacheUpdate = null;
  }

  /**
   * Get all system settings
   */
  async getAllSettings(includePrivate = false) {
    try {
      const query = includePrivate
        ? 'SELECT * FROM system_settings ORDER BY setting_key ASC'
        : 'SELECT * FROM system_settings WHERE is_public = true ORDER BY setting_key ASC';

      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logError('Error fetching system settings:', error);
      throw new AppError(500, 'Failed to fetch system settings');
    }
  }

  /**
   * Get a specific setting by key
   */
  async getSetting(key, useCache = true) {
    try {
      // Check cache
      if (useCache && this.cache.has(key)) {
        const cached = this.cache.get(key);
        const now = Date.now();
        if (now - cached.timestamp < this.cacheTimeout) {
          return cached.value;
        }
      }

      const result = await pool.query(
        'SELECT * FROM system_settings WHERE setting_key = $1',
        [key]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const setting = result.rows[0];
      const value = this.parseSettingValue(setting.setting_value, setting.setting_type);

      // Update cache
      this.cache.set(key, { value, timestamp: Date.now() });

      return value;
    } catch (error) {
      logError(`Error fetching setting ${key}:`, error);
      throw new AppError(500, 'Failed to fetch setting');
    }
  }

  /**
   * Get multiple settings at once
   */
  async getSettings(keys, useCache = true) {
    try {
      const settings = {};
      
      for (const key of keys) {
        settings[key] = await this.getSetting(key, useCache);
      }

      return settings;
    } catch (error) {
      logError('Error fetching multiple settings:', error);
      throw new AppError(500, 'Failed to fetch settings');
    }
  }

  /**
   * Update a setting
   */
  async updateSetting(key, value, updatedBy = null) {
    try {
      // Get existing setting to determine type
      const existingResult = await pool.query(
        'SELECT setting_type FROM system_settings WHERE setting_key = $1',
        [key]
      );

      if (existingResult.rows.length === 0) {
        throw new AppError(404, `Setting '${key}' not found`);
      }

      const settingType = existingResult.rows[0].setting_type;
      const stringValue = this.stringifySettingValue(value, settingType);

      // Validate value type
      if (!this.validateSettingValue(value, settingType)) {
        throw new AppError(400, `Invalid value type for setting '${key}'. Expected: ${settingType}`);
      }

      const result = await pool.query(
        `UPDATE system_settings 
         SET setting_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
         WHERE setting_key = $3
         RETURNING *`,
        [stringValue, updatedBy, key]
      );

      // Clear cache for this key
      this.cache.delete(key);

      log(`✅ System setting updated: ${key} = ${stringValue}`);
      return result.rows[0];
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError(`Error updating setting ${key}:`, error);
      throw new AppError(500, 'Failed to update setting');
    }
  }

  /**
   * Create a new setting
   */
  async createSetting(settingData) {
    try {
      const {
        key, value, type, description = null, isPublic = false
      } = settingData;

      const stringValue = this.stringifySettingValue(value, type);

      const result = await pool.query(
        `INSERT INTO system_settings (
          setting_key, setting_value, setting_type, description, is_public
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [key, stringValue, type, description, isPublic]
      );

      log(`✅ System setting created: ${key}`);
      return result.rows[0];
    } catch (error) {
      if (error.constraint === 'system_settings_pkey') {
        throw new AppError(400, 'Setting key already exists');
      }
      logError('Error creating setting:', error);
      throw new AppError(500, 'Failed to create setting');
    }
  }

  /**
   * Delete a setting
   */
  async deleteSetting(key) {
    try {
      const result = await pool.query(
        'DELETE FROM system_settings WHERE setting_key = $1 RETURNING setting_key',
        [key]
      );

      if (result.rowCount === 0) {
        throw new AppError(404, 'Setting not found');
      }

      // Clear cache
      this.cache.delete(key);

      log(`✅ System setting deleted: ${key}`);
      return { deleted: true };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError(`Error deleting setting ${key}:`, error);
      throw new AppError(500, 'Failed to delete setting');
    }
  }

  /**
   * Parse setting value based on type
   */
  parseSettingValue(value, type) {
    switch (type) {
      case 'number':
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
      
      case 'boolean':
        return value === 'true' || value === '1' || value === 1 || value === true;
      
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      
      case 'string':
      default:
        return value;
    }
  }

  /**
   * Stringify value for storage
   */
  stringifySettingValue(value, type) {
    switch (type) {
      case 'number':
        return String(value);
      
      case 'boolean':
        return value ? 'true' : 'false';
      
      case 'json':
        return JSON.stringify(value);
      
      case 'string':
      default:
        return String(value);
    }
  }

  /**
   * Validate value matches expected type
   */
  validateSettingValue(value, type) {
    switch (type) {
      case 'number':
        return !isNaN(parseFloat(value));
      
      case 'boolean':
        return typeof value === 'boolean' || value === 'true' || value === 'false' || value === 0 || value === 1;
      
      case 'json':
        if (typeof value === 'object') return true;
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      
      case 'string':
        return typeof value === 'string' || value !== null;
      
      default:
        return true;
    }
  }

  /**
   * Clear all cache
   */
  clearCache() {
    this.cache.clear();
    this.lastCacheUpdate = null;
    log('✅ System settings cache cleared');
  }

  /**
   * Get public settings (for frontend)
   */
  async getPublicSettings() {
    try {
      const result = await pool.query(
        'SELECT setting_key, setting_value, setting_type FROM system_settings WHERE is_public = true'
      );

      const settings = {};
      result.rows.forEach(row => {
        settings[row.setting_key] = this.parseSettingValue(row.setting_value, row.setting_type);
      });

      return settings;
    } catch (error) {
      logError('Error fetching public settings:', error);
      throw new AppError(500, 'Failed to fetch public settings');
    }
  }

  // ========== CONVENIENCE METHODS ==========

  async getEztValueInr() {
    return await this.getSetting('ezt_value_inr') || 100;
  }

  async getCommissionPercentage() {
    return await this.getSetting('commission_percentage') || 10;
  }

  async getReferralReward() {
    return await this.getSetting('referral_ezt_reward') || 100;
  }

  async getReferralDiscount() {
    return await this.getSetting('referral_discount') || 500;
  }

  async getSignupBonus() {
    return await this.getSetting('signup_bonus_ezt') || 100;
  }

  async isAchievementSystemEnabled() {
    return await this.getSetting('achievement_system_enabled') || false;
  }

  async isReferralSystemEnabled() {
    return await this.getSetting('referral_system_enabled') || false;
  }

  async getVoucherExpiryDays() {
    return await this.getSetting('voucher_expiry_days') || 30;
  }

  async getCancellationWindowHours() {
    return await this.getSetting('cancellation_window_hours') || 24;
  }
}

module.exports = new SystemSettingsService();

