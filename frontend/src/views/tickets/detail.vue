<template>
  <div class="ticket-detail-page">
    <el-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-button @click="$router.back()">
              <el-icon><Back /></el-icon>
              返回
            </el-button>
            <span class="title">工单详情</span>
          </div>
          <div class="header-right">
            <el-button
              v-if="ticket && ticket.status === 1 && isCreator"
              type="danger"
              @click="handleCancel"
            >
              取消工单
            </el-button>
          </div>
        </div>
      </template>

      <template v-if="ticket">
        <!-- 工单基本信息 -->
        <div class="ticket-info">
          <pre style="background:#f5f5f5;padding:10px;margin-bottom:10px;overflow:auto;max-height:200px;">{{ JSON.stringify(ticket, null, 2) }}</pre>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="工单编号">{{ ticket.ticket_no }}</el-descriptions-item>
            <el-descriptions-item label="工单标题">{{ ticket.title }}</el-descriptions-item>
            <el-descriptions-item label="所属流程">{{ ticket.workflow_name }}</el-descriptions-item>
            <el-descriptions-item label="当前节点">
              <el-tag type="primary">{{ ticket.current_node_name || '-' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="优先级">
              <el-tag :type="getPriorityType(ticket.priority)">
                {{ getPriorityLabel(ticket.priority) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="getStatusType(ticket.status)">
                {{ getStatusLabel(ticket.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="创建人">{{ ticket.creator_name }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDate(ticket.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ formatDate(ticket.updated_at) }}</el-descriptions-item>
          </el-descriptions>

          <el-divider />

          <div class="info-section">
            <h4>工单描述</h4>
            <p class="description">{{ ticket.description || '无' }}</p>
          </div>

          <!-- 表单数据 -->
          <div v-if="ticket.formData && Object.keys(ticket.formData).length > 0" class="info-section">
            <el-divider />
            <h4>表单数据</h4>
            <el-descriptions :column="2" border>
              <el-descriptions-item
                v-for="(value, key) in ticket.formData"
                :key="key"
                :label="key"
              >
                {{ value }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <el-divider />

        <!-- 审批操作区 -->
        <div v-if="canApprove || hasTodoTask" class="approval-section">
          <h3>审批操作</h3>

          <!-- 会签任务 -->
          <template v-if="countersignTask">
            <el-alert
              title="会签任务"
              description="此节点需要多人审批，请提交您的审批意见"
              type="info"
              :closable="false"
              show-icon
              class="mb-4"
            />
            <el-form :model="approvalForm" label-width="80px">
              <el-form-item label="审批意见">
                <el-radio-group v-model="approvalForm.action">
                  <el-radio-button label="approve">通过</el-radio-button>
                  <el-radio-button label="reject">驳回</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="审批备注">
                <el-input
                  v-model="approvalForm.comment"
                  type="textarea"
                  rows="3"
                  placeholder="请输入审批备注"
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :loading="approvalLoading" @click="handleCountersign">
                  提交会签
                </el-button>
              </el-form-item>
            </el-form>
          </template>

          <!-- 普通审批任务（包括从待办页面跳转过来的情况） -->
          <template v-else>
            <el-form :model="approvalForm" label-width="80px">
              <el-form-item label="审批意见">
                <el-radio-group v-model="approvalForm.action">
                  <el-radio-button label="approve">通过</el-radio-button>
                  <el-radio-button label="reject">驳回</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="审批备注">
                <el-input
                  v-model="approvalForm.comment"
                  type="textarea"
                  rows="3"
                  placeholder="请输入审批备注"
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :loading="approvalLoading" @click="handleApprove">
                  提交审批
                </el-button>
                <el-button v-if="currentTask" @click="showTransfer = true">转派</el-button>
              </el-form-item>
            </el-form>
          </template>
        </div>

        <el-divider v-if="canApprove || hasTodoTask" />

        <!-- 流转历史 -->
        <div class="history-section">
          <h3>流转历史</h3>
          <el-timeline>
            <el-timeline-item
              v-for="(item, index) in ticket.history"
              :key="index"
              :type="getHistoryType(item.action)"
              :timestamp="formatDate(item.created_at)"
            >
              <div class="history-item">
                <div class="history-header">
                  <span class="node-name">{{ item.node_name || '系统' }}</span>
                  <el-tag size="small" :type="getActionType(item.action)">
                    {{ getActionLabel(item.action) }}
                  </el-tag>
                </div>
                <div class="history-body">
                  <p><strong>操作人：</strong>{{ item.action_by_name }}</p>
                  <p v-if="item.comment"><strong>备注：</strong>{{ item.comment }}</p>
                  <p v-if="item.next_node_name">
                    <strong>下一节点：</strong>{{ item.next_node_name }}
                  </p>
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </template>
    </el-card>

    <!-- 转派对话框 -->
    <el-dialog title="转派任务" v-model="showTransfer" width="500px">
      <el-form :model="transferForm" label-width="100px">
        <el-form-item label="转派给">
          <el-radio-group v-model="transferForm.assigneeType">
            <el-radio-button :label="1">用户</el-radio-button>
            <el-radio-button :label="2">角色</el-radio-button>
            <el-radio-button :label="3">部门</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="选择" v-if="transferForm.assigneeType === 1">
          <el-select
            v-model="transferForm.assigneeId"
            placeholder="选择用户"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="user in userList"
              :key="user.id"
              :label="user.real_name || user.username"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="选择" v-if="transferForm.assigneeType === 2">
          <el-select v-model="transferForm.assigneeId" placeholder="选择角色" style="width: 100%">
            <el-option
              v-for="role in roleList"
              :key="role.id"
              :label="role.name"
              :value="role.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="选择" v-if="transferForm.assigneeType === 3">
          <el-tree-select
            v-model="transferForm.assigneeId"
            :data="departmentList"
            :props="{ label: 'name', value: 'id' }"
            placeholder="选择部门"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="转派备注">
          <el-input
            v-model="transferForm.comment"
            type="textarea"
            rows="3"
            placeholder="请输入转派备注"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTransfer = false">取消</el-button>
        <el-button type="primary" :loading="transferLoading" @click="handleTransfer">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { useUserStore } from '@/stores/user'
import { getTicket, approveTicket, countersignTicket, transferTask, cancelTicket } from '@/api/tickets'
import { getUsers } from '@/api/users'
import { getRoles } from '@/api/roles'
import { getDepartments } from '@/api/departments'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const ticketId = route.params.id

const loading = ref(false)
const ticket = ref(null)
const currentTask = ref(null)
const countersignTask = ref(null)

const userList = ref([])
const roleList = ref([])
const departmentList = ref([])

const approvalLoading = ref(false)
const approvalForm = reactive({
  action: 'approve',
  comment: ''
})

const showTransfer = ref(false)
const transferLoading = ref(false)
const transferForm = reactive({
  assigneeType: 1,
  assigneeId: undefined,
  comment: ''
})

const isCreator = computed(() => {
  return ticket.value?.created_by === userStore.userId
})

const canApprove = computed(() => {
  // 状态为进行中(1) 且 有当前任务或会签任务
  return ticket.value?.status === 1 && (currentTask.value || countersignTask.value)
})

// 是否有待办任务（从待办页面跳转过来时显示审批按钮）
const hasTodoTask = computed(() => {
  return ticket.value?.status === 1 && ticket.value?.current_node_id && ticket.value?.current_node_id !== 'n8n_processing'
})

const fetchTicket = async () => {
  loading.value = true
  try {
    const res = await getTicket(ticketId)
    console.log('[TicketDetail] API 返回数据:', res)
    ticket.value = res
    console.log('[TicketDetail] ticket.value 设置后:', ticket.value)

    // 查找当前用户的任务
    console.log('[TicketDetail] 查找任务, tasks:', res.tasks)
    console.log('[TicketDetail] 当前用户:', { userId: userStore.userId, roles: userStore.roles, departmentId: userStore.userInfo?.departmentId })
    if (res.tasks) {
      currentTask.value = res.tasks.find(t => {
        const match = t.status === 0 && (
          (t.assignee_type === 1 && t.assignee_id === userStore.userId) ||
          (t.assignee_type === 2 && userStore.roles?.some(r => r.id === t.assignee_id)) ||
          (t.assignee_type === 3 && t.assignee_id === userStore.userInfo?.departmentId)
        )
        console.log(`[TicketDetail] 任务 ${t.id} (${t.node_name}): assignee_type=${t.assignee_type}, assignee_id=${t.assignee_id}, status=${t.status}, match=${match}`)
        return match
      })
      console.log('[TicketDetail] 匹配到的任务:', currentTask.value)
    }
  } catch (error) {
    console.error('获取工单详情失败:', error)
  } finally {
    loading.value = false
  }
}

const fetchUsers = async () => {
  try {
    const res = await getUsers({ page: 1, pageSize: 1000 })
    userList.value = res.list
  } catch (error) {
    console.error('获取用户失败:', error)
  }
}

const fetchRoles = async () => {
  try {
    const res = await getRoles()
    roleList.value = res
  } catch (error) {
    console.error('获取角色失败:', error)
  }
}

const fetchDepartments = async () => {
  try {
    const res = await getDepartments()
    departmentList.value = res
  } catch (error) {
    console.error('获取部门失败:', error)
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

const getHistoryType = (action) => {
  const types = {
    submit: 'primary',
    approve: 'success',
    reject: 'danger',
    transfer: 'warning',
    cancel: 'info'
  }
  return types[action] || ''
}

const getActionType = (action) => {
  const types = {
    submit: 'primary',
    approve: 'success',
    reject: 'danger',
    transfer: 'warning',
    cancel: 'info'
  }
  return types[action] || ''
}

const getActionLabel = (action) => {
  const labels = {
    submit: '提交',
    approve: '审批通过',
    reject: '驳回',
    transfer: '转派',
    cancel: '取消',
    n8n_callback: '系统回调',
    n8n_proceed: '自动流转'
  }
  return labels[action] || action
}

const formatDate = (date) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

const handleApprove = async () => {
  approvalLoading.value = true
  try {
    // 如果有当前任务，使用 taskId；否则使用 nodeId
    const params = {
      action: approvalForm.action,
      comment: approvalForm.comment
    }
    if (currentTask.value) {
      params.taskId = currentTask.value.id
    } else if (ticket.value?.current_node_id) {
      params.nodeId = ticket.value.current_node_id
    }
    await approveTicket(ticketId, params)
    ElMessage.success(approvalForm.action === 'approve' ? '审批通过' : '已驳回')
    fetchTicket()
  } catch (error) {
    console.error('审批失败:', error)
  } finally {
    approvalLoading.value = false
  }
}

const handleCountersign = async () => {
  approvalLoading.value = true
  try {
    await countersignTicket(ticketId, {
      countersignId: countersignTask.value.id,
      action: approvalForm.action,
      comment: approvalForm.comment
    })
    ElMessage.success('会签提交成功')
    fetchTicket()
  } catch (error) {
    console.error('会签失败:', error)
  } finally {
    approvalLoading.value = false
  }
}

const handleTransfer = async () => {
  if (!transferForm.assigneeId) {
    ElMessage.warning('请选择转派对象')
    return
  }

  transferLoading.value = true
  try {
    await transferTask(ticketId, {
      taskId: currentTask.value.id,
      newAssigneeType: transferForm.assigneeType,
      newAssigneeId: transferForm.assigneeId,
      comment: transferForm.comment
    })
    ElMessage.success('转派成功')
    showTransfer.value = false
    fetchTicket()
  } catch (error) {
    console.error('转派失败:', error)
  } finally {
    transferLoading.value = false
  }
}

const handleCancel = async () => {
  try {
    await ElMessageBox.confirm('确定要取消此工单吗？', '提示', { type: 'warning' })
    await cancelTicket(ticketId, { comment: '用户取消' })
    ElMessage.success('工单已取消')
    fetchTicket()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('取消工单失败:', error)
    }
  }
}

onMounted(() => {
  fetchTicket()
  fetchUsers()
  fetchRoles()
  fetchDepartments()
})
</script>

<style scoped lang="scss">
.ticket-detail-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;

      .title {
        font-size: 16px;
        font-weight: 500;
      }
    }
  }

  .ticket-info {
    .info-section {
      margin-top: 20px;

      h4 {
        margin-bottom: 12px;
        font-size: 14px;
        color: #606266;
      }

      .description {
        color: #606266;
        line-height: 1.6;
        white-space: pre-wrap;
      }
    }
  }

  .approval-section {
    h3 {
      margin-bottom: 20px;
      font-size: 16px;
    }

    .mb-4 {
      margin-bottom: 16px;
    }
  }

  .history-section {
    h3 {
      margin-bottom: 20px;
      font-size: 16px;
    }

    .history-item {
      .history-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;

        .node-name {
          font-weight: 500;
        }
      }

      .history-body {
        color: #606266;
        font-size: 13px;

        p {
          margin: 4px 0;
        }
      }
    }
  }
}
</style>
