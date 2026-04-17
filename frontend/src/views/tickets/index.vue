<template>
  <div class="tickets-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>工单管理</span>
          <el-button type="primary" @click="$router.push('/tickets/create')">
            <el-icon><Plus /></el-icon>
            创建工单
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :model="searchForm" inline class="search-form">
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="工单编号/标题"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="流程">
          <el-select v-model="searchForm.workflowId" placeholder="请选择流程" clearable>
            <el-option
              v-for="workflow in workflowList"
              :key="workflow.id"
              :label="workflow.name"
              :value="workflow.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="searchForm.priority" placeholder="请选择优先级" clearable>
            <el-option label="低" :value="1" />
            <el-option label="中" :value="2" />
            <el-option label="高" :value="3" />
            <el-option label="紧急" :value="4" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option label="已取消" :value="0" />
            <el-option label="进行中" :value="1" />
            <el-option label="已完成" :value="2" />
            <el-option label="已驳回" :value="3" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 工单表格 -->
      <el-table :data="ticketList" v-loading="loading">
        <el-table-column prop="ticket_no" label="工单编号" width="150" />
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="workflow_name" label="流程" width="120" />
        <el-table-column prop="current_node_name" label="当前节点" width="120" />
        <el-table-column prop="priority" label="优先级" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="getPriorityType(row.priority)" size="small">
              {{ getPriorityLabel(row.priority) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="creator_name" label="创建人" width="100" />
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleView(row)">查看</el-button>
            <el-button 
              v-if="row.status === 0 || row.status === 2" 
              type="danger" 
              link 
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { getTickets, deleteTicket } from '@/api/tickets'
import { getWorkflows } from '@/api/workflows'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const loading = ref(false)
const ticketList = ref([])
const workflowList = ref([])

const searchForm = reactive({
  keyword: '',
  workflowId: undefined,
  priority: undefined,
  status: undefined
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const fetchTickets = async () => {
  loading.value = true
  try {
    const res = await getTickets({
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...searchForm
    })
    ticketList.value = res.list
    pagination.total = res.pagination.total
  } catch (error) {
    console.error('获取工单列表失败:', error)
  } finally {
    loading.value = false
  }
}

const fetchWorkflows = async () => {
  try {
    const res = await getWorkflows({ status: 1 })
    workflowList.value = res
  } catch (error) {
    console.error('获取流程列表失败:', error)
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

const handleSearch = () => {
  pagination.page = 1
  fetchTickets()
}

const handleReset = () => {
  searchForm.keyword = ''
  searchForm.workflowId = undefined
  searchForm.priority = undefined
  searchForm.status = undefined
  handleSearch()
}

const handleSizeChange = (size) => {
  pagination.pageSize = size
  fetchTickets()
}

const handlePageChange = (page) => {
  pagination.page = page
  fetchTickets()
}

const handleView = (row) => {
  router.push(`/tickets/detail/${row.id}`)
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除工单 "${row.title}" 吗？删除后不可恢复。`,
      '提示',
      { type: 'warning' }
    )
    await deleteTicket(row.id)
    ElMessage.success('删除成功')
    fetchTickets()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除工单失败:', error)
      ElMessage.error(error.response?.data?.message || '删除失败')
    }
  }
}

onMounted(() => {
  fetchTickets()
  fetchWorkflows()
})
</script>

<style scoped lang="scss">
.tickets-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .search-form {
    margin-bottom: 20px;
  }

  .pagination {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
