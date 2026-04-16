<template>
  <div class="workflows-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>流程管理</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增流程
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :model="searchForm" inline class="search-form">
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="流程名称/编码"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option label="草稿" :value="0" />
            <el-option label="已发布" :value="1" />
            <el-option label="已停用" :value="2" />
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

      <!-- 流程表格 -->
      <el-table :data="workflowList" v-loading="loading">
        <el-table-column type="index" width="50" />
        <el-table-column prop="name" label="流程名称" min-width="150" />
        <el-table-column prop="code" label="流程编码" width="150" />
        <el-table-column prop="version" label="版本" width="80" align="center" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_by_name" label="创建人" width="120" />
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleDesign(row)">设计</el-button>
            <el-button
              v-if="row.status === 0"
              type="success"
              link
              @click="handlePublish(row)"
            >
              发布
            </el-button>
            <el-button
              v-if="row.status === 1"
              type="warning"
              link
              @click="handleUnpublish(row)"
            >
              取消发布
            </el-button>
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="primary" link @click="handleClone(row)">复制</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 流程表单对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="600px"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="流程名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入流程名称" />
        </el-form-item>
        <el-form-item label="流程编码" prop="code">
          <el-input v-model="form.code" placeholder="请输入流程编码" :disabled="isEdit" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            rows="3"
            placeholder="请输入流程描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import {
  getWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  publishWorkflow,
  unpublishWorkflow,
  cloneWorkflow
} from '@/api/workflows'

const router = useRouter()
const loading = ref(false)
const submitLoading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref(null)
const workflowList = ref([])

const searchForm = reactive({
  keyword: '',
  status: undefined
})

const formRef = ref(null)
const form = reactive({
  name: '',
  code: '',
  description: ''
})

const rules = {
  name: [{ required: true, message: '请输入流程名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入流程编码', trigger: 'blur' }]
}

const dialogTitle = computed(() => isEdit.value ? '编辑流程' : '新增流程')

const fetchWorkflows = async () => {
  loading.value = true
  try {
    const res = await getWorkflows(searchForm)
    workflowList.value = res
  } catch (error) {
    console.error('获取流程列表失败:', error)
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.name = ''
  form.code = ''
  form.description = ''
  currentId.value = null
}

const getStatusType = (status) => {
  const types = { 0: 'info', 1: 'success', 2: 'danger' }
  return types[status] || ''
}

const getStatusLabel = (status) => {
  const labels = { 0: '草稿', 1: '已发布', 2: '已停用' }
  return labels[status] || '未知'
}

const formatDate = (date) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const handleSearch = () => {
  fetchWorkflows()
}

const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = undefined
  fetchWorkflows()
}

const handleAdd = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  currentId.value = row.id
  form.name = row.name
  form.code = row.code
  form.description = row.description
  dialogVisible.value = true
}

const handleDesign = (row) => {
  router.push(`/workflows/design/${row.id}`)
}

const handlePublish = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要发布流程 "${row.name}" 吗？发布后流程将可以被使用。`,
      '提示',
      { type: 'warning' }
    )
    await publishWorkflow(row.id)
    ElMessage.success('发布成功')
    fetchWorkflows()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('发布流程失败:', error)
    }
  }
}

const handleUnpublish = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要取消发布流程 "${row.name}" 吗？取消后流程将回到草稿状态，可以继续编辑。`,
      '提示',
      { type: 'warning' }
    )
    await unpublishWorkflow(row.id)
    ElMessage.success('已取消发布')
    fetchWorkflows()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('取消发布流程失败:', error)
      ElMessage.error(error.response?.data?.message || '取消发布失败')
    }
  }
}

const handleClone = async (row) => {
  try {
    await cloneWorkflow(row.id, { name: `${row.name} (副本)` })
    ElMessage.success('复制成功')
    fetchWorkflows()
  } catch (error) {
    console.error('复制流程失败:', error)
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除流程 "${row.name}" 吗？`,
      '提示',
      { type: 'warning' }
    )
    await deleteWorkflow(row.id)
    ElMessage.success('删除成功')
    fetchWorkflows()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除流程失败:', error)
    }
  }
}

const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const data = {
      name: form.name,
      code: form.code,
      description: form.description,
      definition: {
        nodes: [
          { id: 'start', type: 'start', name: '开始' },
          { id: 'end', type: 'end', name: '结束' }
        ],
        edges: []
      }
    }

    if (isEdit.value) {
      await updateWorkflow(currentId.value, data)
      ElMessage.success('更新成功')
    } else {
      await createWorkflow(data)
      ElMessage.success('创建成功')
    }

    dialogVisible.value = false
    fetchWorkflows()
  } catch (error) {
    console.error('保存流程失败:', error)
  } finally {
    submitLoading.value = false
  }
}

onMounted(() => {
  fetchWorkflows()
})
</script>

<style scoped lang="scss">
.workflows-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .search-form {
    margin-bottom: 20px;
  }
}
</style>
