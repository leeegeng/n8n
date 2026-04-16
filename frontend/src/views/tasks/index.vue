<template>
  <div class="tasks-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>我的待办</span>
          <el-badge :value="totalTasks" v-if="totalTasks > 0" />
        </div>
      </template>

      <!-- 审批任务 -->
      <div v-if="approvalTasks.length > 0" class="task-section">
        <h3>审批任务</h3>
        <el-row :gutter="20">
          <el-col
            v-for="task in approvalTasks"
            :key="task.id"
            :xs="24"
            :sm="12"
            :md="8"
            :lg="6"
          >
            <el-card class="task-card" shadow="hover" @click="handleViewTicket(task.ticket_id)">
              <div class="task-header">
                <el-tag :type="getPriorityType(task.priority)" size="small">
                  {{ getPriorityLabel(task.priority) }}
                </el-tag>
                <span class="task-time">{{ formatDate(task.created_at) }}</span>
              </div>
              <div class="task-body">
                <h4 class="task-title">{{ task.title }}</h4>
                <p class="task-no">{{ task.ticket_no }}</p>
                <p class="task-node">
                  <el-icon><UserFilled /></el-icon>
                  当前节点：{{ task.node_name }}
                </p>
                <p class="task-creator">
                  <el-icon><User /></el-icon>
                  创建人：{{ task.creator_name }}
                </p>
              </div>
              <div class="task-footer">
                <el-button type="primary" size="small" @click.stop="handleViewTicket(task.ticket_id)">
                  去处理
                </el-button>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>

      <!-- 会签任务 -->
      <div v-if="countersignTasks.length > 0" class="task-section">
        <h3>会签任务</h3>
        <el-row :gutter="20">
          <el-col
            v-for="task in countersignTasks"
            :key="task.id"
            :xs="24"
            :sm="12"
            :md="8"
            :lg="6"
          >
            <el-card class="task-card countersign" shadow="hover" @click="handleViewTicket(task.ticket_id)">
              <div class="task-header">
                <el-tag type="warning" size="small">会签</el-tag>
                <el-tag :type="getPriorityType(task.priority)" size="small">
                  {{ getPriorityLabel(task.priority) }}
                </el-tag>
              </div>
              <div class="task-body">
                <h4 class="task-title">{{ task.title }}</h4>
                <p class="task-no">{{ task.ticket_no }}</p>
                <p class="task-node">
                  <el-icon><UserFilled /></el-icon>
                  当前节点：{{ task.node_name }}
                </p>
              </div>
              <div class="task-footer">
                <el-button type="warning" size="small" @click.stop="handleViewTicket(task.ticket_id)">
                  去会签
                </el-button>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>

      <!-- 空状态 -->
      <el-empty
        v-if="approvalTasks.length === 0 && countersignTasks.length === 0"
        description="暂无待办任务"
      >
        <el-button type="primary" @click="$router.push('/tickets')">查看工单列表</el-button>
      </el-empty>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { getTodoTasks } from '@/api/tickets'

const router = useRouter()
const approvalTasks = ref([])
const countersignTasks = ref([])

const totalTasks = computed(() => {
  return approvalTasks.value.length + countersignTasks.value.length
})

const fetchTasks = async () => {
  try {
    const res = await getTodoTasks()
    approvalTasks.value = res.approvalTasks || []
    countersignTasks.value = res.countersignTasks || []
  } catch (error) {
    console.error('获取待办任务失败:', error)
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

const formatDate = (date) => {
  return dayjs(date).format('MM-DD HH:mm')
}

const handleViewTicket = (ticketId) => {
  router.push(`/tickets/detail/${ticketId}`)
}

onMounted(() => {
  fetchTasks()
})
</script>

<style scoped lang="scss">
.tasks-page {
  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .task-section {
    margin-bottom: 30px;

    h3 {
      margin-bottom: 16px;
      font-size: 16px;
      color: #303133;
      border-left: 4px solid #409eff;
      padding-left: 12px;
    }
  }

  .task-card {
    margin-bottom: 20px;
    cursor: pointer;
    transition: all 0.3s;

    &:hover {
      transform: translateY(-4px);
    }

    &.countersign {
      border-top: 3px solid #e6a23c;
    }

    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      .task-time {
        font-size: 12px;
        color: #909399;
      }
    }

    .task-body {
      .task-title {
        font-size: 15px;
        font-weight: 500;
        color: #303133;
        margin-bottom: 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .task-no {
        font-size: 12px;
        color: #909399;
        margin-bottom: 8px;
      }

      .task-node,
      .task-creator {
        font-size: 13px;
        color: #606266;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
    }

    .task-footer {
      margin-top: 12px;
      display: flex;
      justify-content: flex-end;
    }
  }
}
</style>
