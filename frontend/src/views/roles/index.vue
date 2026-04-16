<template>
  <div class="roles-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>角色管理</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增角色
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :model="searchForm" inline class="search-form">
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="角色名称/编码"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
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

      <!-- 角色表格 -->
      <el-table :data="roleList" v-loading="loading">
        <el-table-column type="index" width="50" />
        <el-table-column prop="name" label="角色名称" width="150" />
        <el-table-column prop="code" label="角色编码" width="150" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="user_count" label="用户数" width="100" align="center" />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="primary" link @click="handleAssignUsers(row)">分配用户</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 角色表单对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="500px"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="form.code" placeholder="请输入角色编码" :disabled="isEdit" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            rows="3"
            placeholder="请输入角色描述"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :label="1">启用</el-radio>
            <el-radio :label="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 分配用户对话框 -->
    <el-dialog title="分配用户" v-model="userDialogVisible" width="600px">
      <el-transfer
        v-model="selectedUsers"
        :data="userOptions"
        :titles="['未分配', '已分配']"
        :props="{ key: 'id', label: 'label' }"
        filterable
        :filter-method="filterUser"
        filter-placeholder="搜索用户"
      />
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="assignLoading" @click="handleAssignSubmit">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getRoleUsers,
  assignRoleUsers
} from '@/api/roles'
import { getUsers } from '@/api/users'

const loading = ref(false)
const submitLoading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref(null)
const roleList = ref([])

const searchForm = reactive({
  keyword: '',
  status: undefined
})

const formRef = ref(null)
const form = reactive({
  name: '',
  code: '',
  description: '',
  status: 1
})

const rules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }]
}

const dialogTitle = computed(() => isEdit.value ? '编辑角色' : '新增角色')

// 分配用户
const userDialogVisible = ref(false)
const assignLoading = ref(false)
const userOptions = ref([])
const selectedUsers = ref([])

const fetchRoles = async () => {
  loading.value = true
  try {
    const res = await getRoles(searchForm)
    roleList.value = res
  } catch (error) {
    console.error('获取角色列表失败:', error)
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.name = ''
  form.code = ''
  form.description = ''
  form.status = 1
  currentId.value = null
}

const handleSearch = () => {
  fetchRoles()
}

const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = undefined
  fetchRoles()
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
  form.status = row.status
  dialogVisible.value = true
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除角色 "${row.name}" 吗？`,
      '提示',
      { type: 'warning' }
    )
    await deleteRole(row.id)
    ElMessage.success('删除成功')
    fetchRoles()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除角色失败:', error)
    }
  }
}

const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    if (isEdit.value) {
      await updateRole(currentId.value, form)
      ElMessage.success('更新成功')
    } else {
      await createRole(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchRoles()
  } catch (error) {
    console.error('保存角色失败:', error)
  } finally {
    submitLoading.value = false
  }
}

// 分配用户
const handleAssignUsers = async (row) => {
  currentId.value = row.id
  userDialogVisible.value = true

  try {
    // 获取所有用户
    const usersRes = await getUsers({ page: 1, pageSize: 1000 })
    userOptions.value = usersRes.list.map(user => ({
      id: user.id,
      label: `${user.real_name || user.username} (${user.username})`
    }))

    // 获取已分配的用户
    const roleUsersRes = await getRoleUsers(row.id)
    selectedUsers.value = roleUsersRes.map(user => user.id)
  } catch (error) {
    console.error('获取用户列表失败:', error)
  }
}

const filterUser = (query, item) => {
  return item.label.toLowerCase().includes(query.toLowerCase())
}

const handleAssignSubmit = async () => {
  assignLoading.value = true
  try {
    await assignRoleUsers(currentId.value, { userIds: selectedUsers.value })
    ElMessage.success('用户分配成功')
    userDialogVisible.value = false
    fetchRoles()
  } catch (error) {
    console.error('分配用户失败:', error)
  } finally {
    assignLoading.value = false
  }
}

onMounted(() => {
  fetchRoles()
})
</script>

<style scoped lang="scss">
.roles-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .search-form {
    margin-bottom: 20px;
  }

  :deep(.el-transfer) {
    display: flex;
    justify-content: center;
    align-items: center;

    .el-transfer__buttons {
      padding: 0 20px;
    }
  }
}
</style>
