const {
  makeUserId, createRoom, sendMessage, getMessages, getLatestMessages
} = require('./helpers/testHelper');

describe('06 — Messaging', () => {
  let roomId;
  let userId;

  beforeAll(async () => {
    userId = makeUserId();
    const result = await createRoom(userId, 'Messenger');
    roomId = result.roomId;
  });

  describe('POST /api/messages/send', () => {
    it('should send a text message', async () => {
      const result = await sendMessage(roomId, userId, 'Messenger', 'Hello World', 'text');
      expect(result.success).toBe(true);
      expect(result.message.content).toBe('Hello World');
      expect(result.message.openId).toBe(userId);
    });

    it('should send a system message', async () => {
      const result = await sendMessage(roomId, userId, 'System', 'Game started', 'system');
      expect(result.success).toBe(true);
    });

    it('should send an action message', async () => {
      const result = await sendMessage(roomId, userId, 'Player', 'voted', 'action');
      expect(result.success).toBe(true);
    });

    it('should reject messages over 1000 chars', async () => {
      const longContent = 'a'.repeat(1001);
      const res = await require('./helpers/testHelper').apiPost('/api/messages/send', {
        roomId, openId: userId, nickName: 'Test', content: longContent, type: 'text'
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid message type', async () => {
      const res = await require('./helpers/testHelper').apiPost('/api/messages/send', {
        roomId, openId: userId, nickName: 'Test', content: 'test', type: 'invalid'
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/messages/:roomId', () => {
    beforeAll(async () => {
      await sendMessage(roomId, userId, 'Messenger', 'Message 1');
      await sendMessage(roomId, userId, 'Messenger', 'Message 2');
      await sendMessage(roomId, userId, 'Messenger', 'Message 3');
    });

    it('should retrieve messages for a room', async () => {
      const result = await getMessages(roomId, 50);
      expect(result.success).toBe(true);
      expect(result.messages.length).toBeGreaterThanOrEqual(3);
    });

    it('should respect the limit parameter', async () => {
      const result = await getMessages(roomId, 2);
      expect(result.messages.length).toBeLessThanOrEqual(2);
    });

    it('should return messages in chronological order', async () => {
      const result = await getMessages(roomId, 50);
      const messages = result.messages;
      if (messages.length >= 2) {
        for (let i = 1; i < messages.length; i++) {
          const prev = new Date(messages[i - 1].createdAt).getTime();
          const curr = new Date(messages[i].createdAt).getTime();
          expect(curr).toBeGreaterThanOrEqual(prev);
        }
      }
    });
  });

  describe('GET /api/messages/:roomId/latest', () => {
    it('should retrieve latest N messages', async () => {
      const result = await getLatestMessages(roomId, 2);
      expect(result.success).toBe(true);
      expect(result.messages.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Missing parameters', () => {
    it('should reject send with missing parameters', async () => {
      const res = await require('./helpers/testHelper').apiPost('/api/messages/send', {
        roomId: roomId
      });
      expect(res.status).toBe(400);
    });
  });
});
