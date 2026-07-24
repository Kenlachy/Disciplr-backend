import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import knex from 'knex';
import { MilestoneRepositoryEnhanced } from '../repositories/milestoneRepositoryEnhanced.js';
import { MilestoneService } from '../services/milestonesDb.js';

describe('MilestoneService', () => {
  let db;
  let repository;
  let service;

  beforeEach(async () => {
    // Create in-memory SQLite database for testing
    db = knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
    })

    // Create tables
    await db.schema.createTable('vaults', (table: any) => {
      table.uuid('id').primary()
      table.decimal('amount', 30, 7).notNullable()
      table.timestamp('start_date').notNullable()
      table.timestamp('end_date').notNullable()
      table.text('verifier').notNullable()
      table.text('success_destination').notNullable()
      table.text('failure_destination').notNullable()
      table.text('creator')
      table.text('status').notNullable().defaultTo('draft')
      table.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    })

    await db.schema.createTable('milestones', (table: any) => {
      table.uuid('id').primary()
      table.uuid('vault_id').notNullable().references('id').inTable('vaults').onDelete('CASCADE')
      table.text('title').notNullable()
      table.text('description')
      table.timestamp('due_date').notNullable()
      table.decimal('amount', 30, 7).notNullable()
      table.integer('sort_order').notNullable()
      table.text('type').notNullable()
      table.json('criteria')
      table.decimal('weight')
      table.text('status').defaultTo('pending')
      table.timestamp('created_at').notNullable().defaultTo(db.fn.now())
      table.timestamp('updated_at')
    })

    await db.schema.createTable('milestone_events', (table: any) => {
      table.uuid('id').primary()
      table.text('user_id').notNullable()
      table.uuid('vault_id').notNullable().references('id').inTable('vaults').onDelete('CASCADE')
      table.text('name').notNullable()
      table.text('status').notNullable()
      table.timestamp('timestamp').notNullable().defaultTo(db.fn.now())
      table.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    })

    // Insert test vault
    await db('vaults').insert({
      id: 'test-vault-1',
      amount: 1000,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 86400000).toISOString(),
      verifier: 'test-verifier',
      success_destination: 'success-addr',
      failure_destination: 'fail-addr',
      status: 'active',
      created_at: new Date().toISOString(),
    });

    repository = new MilestoneRepositoryEnhanced(db);
    service = new MilestoneService(repository);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe('createMilestone', () => {
    it('should create a new milestone', async () => {
      const milestone = await service.createMilestone('test-vault-1', 'Test milestone description');
      
      expect(milestone).toBeDefined();
      expect(milestone.id).toBeDefined();
      expect(milestone.vaultId).toBe('test-vault-1');
      expect(milestone.description).toBe('Test milestone description');
      expect(milestone.verified).toBe(false);
      expect(milestone.createdAt).toBeDefined();
    });

    it('should create milestones with unique IDs', async () => {
      const milestone1 = await service.createMilestone('test-vault-1', 'First milestone');
      const milestone2 = await service.createMilestone('test-vault-1', 'Second milestone');
      
      expect(milestone1.id).not.toBe(milestone2.id);
    });
  });

  describe('getMilestonesByVaultId', () => {
    it('should return empty array for vault with no milestones', async () => {
      const milestones = await service.getMilestonesByVaultId('test-vault-1');
      expect(milestones).toEqual([]);
    });

    it('should return all milestones for a vault', async () => {
      await service.createMilestone('test-vault-1', 'First milestone');
      await service.createMilestone('test-vault-1', 'Second milestone');
      
      const milestones = await service.getMilestonesByVaultId('test-vault-1');
      expect(milestones).toHaveLength(2);
      expect(milestones[0].description).toBe('First milestone');
      expect(milestones[1].description).toBe('Second milestone');
    });

    it('should not return milestones from other vaults', async () => {
      await db('vaults').insert({
        id: 'test-vault-2',
        amount: 2000,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
        verifier: 'test-verifier',
        success_destination: 'success-addr',
        failure_destination: 'fail-addr',
        status: 'active',
        created_at: new Date().toISOString(),
      });
      
      await service.createMilestone('test-vault-1', 'Vault 1 milestone');
      await service.createMilestone('test-vault-2', 'Vault 2 milestone');
      
      const vault1Milestones = await service.getMilestonesByVaultId('test-vault-1');
      const vault2Milestones = await service.getMilestonesByVaultId('test-vault-2');
      
      expect(vault1Milestones).toHaveLength(1);
      expect(vault2Milestones).toHaveLength(1);
      expect(vault1Milestones[0].description).toBe('Vault 1 milestone');
      expect(vault2Milestones[0].description).toBe('Vault 2 milestone');
    });
  });

  describe('getMilestoneById', () => {
    it('should return undefined for non-existent milestone', async () => {
      const milestone = await service.getMilestoneById('non-existent-id');
      expect(milestone).toBeUndefined();
    });

    it('should return the correct milestone', async () => {
      const created = await service.createMilestone('test-vault-1', 'Test milestone');
      const found = await service.getMilestoneById(created.id);
      
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.description).toBe('Test milestone');
    });
  });

  describe('verifyMilestone', () => {
    it('should return null for non-existent milestone', async () => {
      const result = await service.verifyMilestone('non-existent-id');
      expect(result).toBeNull();
    });

    it('should mark milestone as verified', async () => {
      const created = await service.createMilestone('test-vault-1', 'Test milestone');
      expect(created.verified).toBe(false);
      
      const verified = await service.verifyMilestone(created.id);
      expect(verified).toBeDefined();
      expect(verified?.verified).toBe(true);
      expect(verified?.verifiedAt).toBeDefined();
    });

    it('should update milestone status to approved', async () => {
      const created = await service.createMilestone('test-vault-1', 'Test milestone');
      await service.verifyMilestone(created.id);
      
      const found = await service.getMilestoneById(created.id);
      expect(found?.verified).toBe(true);
    });
  });

  describe('allMilestonesVerified', () => {
    it('should return false for vault with no milestones', async () => {
      const result = await service.allMilestonesVerified('test-vault-1');
      expect(result).toBe(false);
    });

    it('should return false when some milestones are not verified', async () => {
      await service.createMilestone('test-vault-1', 'First milestone');
      await service.createMilestone('test-vault-1', 'Second milestone');
      await service.verifyMilestone((await service.getMilestonesByVaultId('test-vault-1'))[0].id);
      
      const result = await service.allMilestonesVerified('test-vault-1');
      expect(result).toBe(false);
    });

    it('should return true when all milestones are verified', async () => {
      const milestones = await service.getMilestonesByVaultId('test-vault-1');
      for (const milestone of milestones) {
        await service.verifyMilestone(milestone.id);
      }
      
      const result = await service.allMilestonesVerified('test-vault-1');
      expect(result).toBe(true);
    });
  });

  describe('addMilestoneEvent', () => {
    it('should add a milestone event', async () => {
      const event = await service.addMilestoneEvent({
        userId: 'user-1',
        vaultId: 'test-vault-1',
        name: 'Test Event',
        status: 'success',
        timestamp: new Date().toISOString(),
      });
      
      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.userId).toBe('user-1');
      expect(event.vaultId).toBe('test-vault-1');
      expect(event.name).toBe('Test Event');
      expect(event.status).toBe('success');
    });
  });

  describe('listMilestoneEvents', () => {
    beforeEach(async () => {
      await service.addMilestoneEvent({
        userId: 'user-1',
        vaultId: 'test-vault-1',
        name: 'Event 1',
        status: 'success',
        timestamp: new Date('2024-01-01').toISOString(),
      });
      await service.addMilestoneEvent({
        userId: 'user-2',
        vaultId: 'test-vault-1',
        name: 'Event 2',
        status: 'failed',
        timestamp: new Date('2024-01-02').toISOString(),
      });
      await service.addMilestoneEvent({
        userId: 'user-1',
        vaultId: 'test-vault-1',
        name: 'Event 3',
        status: 'success',
        timestamp: new Date('2024-01-03').toISOString(),
      });
    });

    it('should return all events when no filters provided', async () => {
      const events = await service.listMilestoneEvents();
      expect(events).toHaveLength(3);
    });

    it('should filter by userId', async () => {
      const events = await service.listMilestoneEvents({ userId: 'user-1' });
      expect(events).toHaveLength(2);
      expect(events.every(e => e.userId === 'user-1')).toBe(true);
    });

    it('should filter by vaultId', async () => {
      const events = await service.listMilestoneEvents({ vaultId: 'test-vault-1' });
      expect(events).toHaveLength(3);
    });

    it('should filter by date range', async () => {
      const events = await service.listMilestoneEvents({
        from: new Date('2024-01-02').toISOString(),
        to: new Date('2024-01-03').toISOString(),
      });
      expect(events).toHaveLength(2);
    });

    it('should filter by status implicitly through date range', async () => {
      const events = await service.listMilestoneEvents({ userId: 'user-1' });
      const successEvents = events.filter(e => e.status === 'success');
      expect(successEvents).toHaveLength(2);
    });
  });
});
