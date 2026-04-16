<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon" style="background: #409EFF;">
            <el-icon :size="32" color="#fff"><Tickets /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalTickets }}</div>
            <div class="stat-label">总工单数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon" style="background: #67C23A;">
            <el-icon :size="32" color="#fff"><CircleCheck /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.completedTickets }}</div>
            <div class="stat-label">已完成</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon" style="background: #E6A23C;">
            <el-icon :size="32" color="#fff"><Timer /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.pendingTickets }}</div>
            <div class="stat-label">进行中</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon" style="background: #F56C6C;">
            <el-icon :size="32" color="#fff"><Bell /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.todoTasks }}</div>
            <div class="stat-label">待办任务</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 快捷操作 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>快捷操作</span>
            </div>
          </template>
          <div class="quick-actions">
            <el-button type="primary" size="large" @click="$router.push('/tickets/create')">
              <el-icon><Plus /></el-icon>
              创建工单
            </el-button>
            <el-button type="warning" size="large" @click="$router.push('/tasks')">
              <el-icon><Bell /></el-icon>
              我的待办
            </el-button>
            <el-button type="success" size="large" @click="$router.push('/tickets')">
              <el-icon><List /></el-icon>
              工单列表
            </el-button>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>系统公告</span>
            </div>
          </template>
          <el-timeline>
            <el-timeline-item
              v-for="(notice, index) in notices"
              :key="index"
              :type="notice.type"
              :timestamp="notice.time"
            >
              {{ notice.content }}
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近工单 -->
    <el-card class="mt-20">
      <template #header>
        <div class="card-header">
          <span>最近工单</span>
          <el-button text @click="$router.push('/tickets')">查看更多</el-button>
        </div>
      </template>
      <el-table :data="recentTickets" style="width: 100%">
        <el-table-column prop="ticket_no" label="工单编号" width="150" />
        <el-table-column prop="title" label="标题" show-overflow-tooltip />
        <el-table-column prop="workflow_name" label="流程" width="120" />
        <el-table-column prop="current_node_name" label="当前节点" width="120" />
        <el-table-column prop="priority" label="优先级" width="100">
          <template #default="{ row }">
            <el-tag :type="getPriorityType(row.priority)">
              {{ getPriorityLabel(row.priority) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getTickets } from '@/api/tickets'
import { getTodoTasks } from '@/api/tickets'
import dayjs from 'dayjs'

const stats = ref({
  totalTickets: 0,
  completedTickets: 0,
  pendingTickets: 0,
  todoTasks: 0
})

const recentTickets = ref([])

const notices = ref([
  { type: 'primary', content: '系统已升级至 v1.0.0 版本', time: '2024-01-01' },
  { type: 'success', content: '新增n8n工作流集成功能', time: '2024-01-01' },
  { type: 'warning', content: '请定期修改密码保证账号安全', time: '2024-01-01' }
])

const fetchStats = async () => {
  try {
    // 获取工单统计
    const ticketsRes = await getTickets({ page: 1, pageSize: 1 })
    stats.value.totalTickets = ticketsRes.pagination.total

    const completedRes = await getTickets({ status: 2, page: 1, pageSize: 1 })
    stats.value.completedTickets = completedRes.pagination.total

    const pendingRes = await getTickets({ status: 1, page: 1, pageSize: 1 })
    stats.value.pendingTickets = pendingRes.pagination.total

    // 获取待办数量
    const todoRes = await getTodoTasks()
    stats.value.todoTasks = (todoRes.approvalTasks?.length || 0) + (todoRes.countersignTasks?.length || 0)

    // 获取最近工单
    const recentRes = await getTickets({ page: 1, pageSize: 5 })
    recentTickets.value = recentRes.list
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

const getPriorityType = (priority) => {
  const types = { 1: 'info', 2: '', 3: 'warning', 4: 'danger' }
  return types[priority] || ''
}

const getPriorityLabel = (priority) => {
  const labels = { 1: '低', 2: '中', 3: '高', 4: '紧急' }
  return labels[priority] || '中'
}

const getStatusType = (status) => {
  const types = { 0: 'info', 1: 'warning', 2: 'success', 3: 'danger' }
  return types[status] || ''
}

const getStatusLabel = (status) => {
  const labels = { 0: '已取消', 1: '进行中', 2: '已完成', 3: '已驳回' }
  return labels[status] || '未知'
}

const formatDate = (date) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

onMounted(() => {
  fetchStats()
})
</script>

<style scoped lang="scss">
.dashboard {
  .mt-20 {
    margin-top: 20px;
  }

  .stat-card {
    display: flex;
    align-items: center;
    padding: 10px;

    .stat-icon {
      width: 64px;
      height: 64px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 16px;
    }

    .stat-info {
      flex: 1;

      .stat-value {
        font-size: 28px;
        font-weight: bold;
        color: #303133;
      }

      .stat-label {
        font-size: 14px;
        color: #909399;
        margin-top: 4px;
      }
    }
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .quick-actions {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;

    .el-button {
      flex: 1;
      min-width: 120px;
    }
  }
}
</style>
