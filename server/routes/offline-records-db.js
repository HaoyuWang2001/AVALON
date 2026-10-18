// 线下对局记录路由（/api/offline-records）——轮询同步，无 socket
const express = require('express');
const OfflineRecordModel = require('../models/OfflineRecordModel');

function createRouter() {
  const router = express.Router();

  // 创建记录（给定配置，进入记录模式）
  router.post('/create', async (req, res) => {
    try {
      const { openId, roomConfig } = req.body;
      if (!openId || !roomConfig) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const record = await OfflineRecordModel.create(openId, roomConfig);
      res.json({ success: true, record });
    } catch (error) {
      console.error('创建线下记录API错误:', error.message);
      res.status(400).json({ success: false, message: error.message || '创建失败' });
    }
  });

  // 我的记录列表（创建的 + 参与的）
  router.get('/list', async (req, res) => {
    try {
      const openId = req.query.openId;
      if (!openId) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const records = await OfflineRecordModel.list(openId);
      res.json({ success: true, records });
    } catch (error) {
      console.error('线下记录列表API错误:', error.message);
      res.status(500).json({ success: false, message: error.message || '获取失败' });
    }
  });

  // 记录详情（防剧透门控）
  router.get('/:recordId', async (req, res) => {
    try {
      const { recordId } = req.params;
      const openId = req.query.openId;
      if (!openId) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const record = await OfflineRecordModel.getDetail(recordId, openId);
      res.json({ success: true, record });
    } catch (error) {
      console.error('线下记录详情API错误:', error.message);
      if (error.message.includes('记录不存在')) return res.status(404).json({ success: false, message: error.message });
      if (error.message.includes('无权查看')) return res.status(403).json({ success: false, message: error.message });
      res.status(500).json({ success: false, message: error.message || '获取失败' });
    }
  });

  // 玩家入座：invited=true（分享带座位邀请）直接入座；否则待房主同意
  router.post('/:recordId/joinSeat', async (req, res) => {
    try {
      const { recordId } = req.params;
      const { openId, seat, userInfo, invited } = req.body;
      if (!openId || !Number.isInteger(seat)) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const record = await OfflineRecordModel.joinSeat(recordId, openId, seat, userInfo, !!invited);
      res.json({ success: true, record });
    } catch (error) {
      console.error('线下记录入座API错误:', error.message);
      if (error.message.includes('记录不存在')) return res.status(404).json({ success: false, message: error.message });
      res.status(400).json({ success: false, message: error.message || '入座失败' });
    }
  });

  // 房主审批自选座位
  router.post('/:recordId/respondSeat', async (req, res) => {
    try {
      const { recordId } = req.params;
      const { openId, targetOpenId, approve } = req.body;
      if (!openId || !targetOpenId || typeof approve !== 'boolean') {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }
      const record = await OfflineRecordModel.respondSeat(recordId, openId, targetOpenId, approve);
      res.json({ success: true, record });
    } catch (error) {
      console.error('线下记录审批API错误:', error.message);
      if (error.message.includes('记录不存在')) return res.status(404).json({ success: false, message: error.message });
      if (error.message.includes('仅房主')) return res.status(403).json({ success: false, message: error.message });
      res.status(400).json({ success: false, message: error.message || '审批失败' });
    }
  });

  // 房主直接指定玩家入座
  router.post('/:recordId/assignPlayer', async (req, res) => {
    try {
      const { recordId } = req.params;
      const { openId, targetOpenId, seat } = req.body;
      if (!openId || !targetOpenId || !Number.isInteger(seat)) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
      }
      const record = await OfflineRecordModel.assignPlayer(recordId, openId, targetOpenId, seat);
      res.json({ success: true, record });
    } catch (error) {
      console.error('线下记录指定玩家API错误:', error.message);
      if (error.message.includes('记录不存在') || error.message.includes('玩家不存在')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      if (error.message.includes('仅房主')) return res.status(403).json({ success: false, message: error.message });
      res.status(400).json({ success: false, message: error.message || '指定失败' });
    }
  });

  // 房主移除玩家
  router.post('/:recordId/removePlayer', async (req, res) => {
    try {
      const { recordId } = req.params;
      const { openId, targetOpenId } = req.body;
      if (!openId || !targetOpenId) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const record = await OfflineRecordModel.removePlayer(recordId, openId, targetOpenId);
      res.json({ success: true, record });
    } catch (error) {
      console.error('线下记录移除玩家API错误:', error.message);
      if (error.message.includes('记录不存在')) return res.status(404).json({ success: false, message: error.message });
      if (error.message.includes('仅房主')) return res.status(403).json({ success: false, message: error.message });
      res.status(400).json({ success: false, message: error.message || '移除失败' });
    }
  });

  // 玩家自行退出
  router.post('/:recordId/leave', async (req, res) => {
    try {
      const { recordId } = req.params;
      const { openId } = req.body;
      if (!openId) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const result = await OfflineRecordModel.leave(recordId, openId);
      res.json(result);
    } catch (error) {
      console.error('线下记录退出API错误:', error.message);
      if (error.message.includes('记录不存在')) return res.status(404).json({ success: false, message: error.message });
      res.status(400).json({ success: false, message: error.message || '退出失败' });
    }
  });

  // 设置身份：自选（无 target）或房主指定；role=null 清除
  router.post('/:recordId/setRole', async (req, res) => {
    try {
      const { recordId } = req.params;
      const { openId, targetOpenId, role } = req.body;
      if (!openId || (role !== null && !role)) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const record = await OfflineRecordModel.setRole(recordId, openId, targetOpenId, role === undefined ? null : role);
      res.json({ success: true, record });
    } catch (error) {
      console.error('线下记录设置身份API错误:', error.message);
      if (error.message.includes('记录不存在')) return res.status(404).json({ success: false, message: error.message });
      if (error.message.includes('仅房主')) return res.status(403).json({ success: false, message: error.message });
      res.status(400).json({ success: false, message: error.message || '设置失败' });
    }
  });

  // 保存轮次（仅房主）
  router.post('/:recordId/saveRounds', async (req, res) => {
    try {
      const { recordId } = req.params;
      const { openId, rounds } = req.body;
      if (!openId) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const record = await OfflineRecordModel.saveRounds(recordId, openId, rounds);
      res.json({ success: true, record });
    } catch (error) {
      console.error('线下记录保存轮次API错误:', error.message);
      if (error.message.includes('记录不存在')) return res.status(404).json({ success: false, message: error.message });
      if (error.message.includes('仅房主')) return res.status(403).json({ success: false, message: error.message });
      res.status(400).json({ success: false, message: error.message || '保存失败' });
    }
  });

  // 记录完成（物化）
  router.post('/:recordId/finish', async (req, res) => {
    try {
      const { recordId } = req.params;
      const { openId } = req.body;
      if (!openId) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const result = await OfflineRecordModel.finish(recordId, openId);
      res.json(result);
    } catch (error) {
      console.error('线下记录完成API错误:', error.message);
      if (error.message.includes('记录不存在')) return res.status(404).json({ success: false, message: error.message });
      if (error.message.includes('仅房主')) return res.status(403).json({ success: false, message: error.message });
      res.status(400).json({ success: false, message: error.message || '完成失败' });
    }
  });

  // 重开草稿（编辑）
  router.post('/:recordId/reopen', async (req, res) => {
    try {
      const { recordId } = req.params;
      const { openId } = req.body;
      if (!openId) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const record = await OfflineRecordModel.reopen(recordId, openId);
      res.json({ success: true, record });
    } catch (error) {
      console.error('线下记录重开API错误:', error.message);
      if (error.message.includes('记录不存在')) return res.status(404).json({ success: false, message: error.message });
      if (error.message.includes('仅房主')) return res.status(403).json({ success: false, message: error.message });
      res.status(400).json({ success: false, message: error.message || '重开失败' });
    }
  });

  // 删除记录（连同物化对局）
  router.post('/:recordId/delete', async (req, res) => {
    try {
      const { recordId } = req.params;
      const { openId } = req.body;
      if (!openId) return res.status(400).json({ success: false, message: '缺少必要参数' });
      const result = await OfflineRecordModel.remove(recordId, openId);
      res.json(result);
    } catch (error) {
      console.error('线下记录删除API错误:', error.message);
      if (error.message.includes('记录不存在')) return res.status(404).json({ success: false, message: error.message });
      if (error.message.includes('仅房主')) return res.status(403).json({ success: false, message: error.message });
      res.status(400).json({ success: false, message: error.message || '删除失败' });
    }
  });

  return router;
}

module.exports = createRouter;
