<template>
  <div class="departments-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>部门管理</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增部门
          </el-button>
        </div>
      </template>

      <el-table
        :data="departmentTree"
        row-key="id"
        default-expand-all
        :tree-props="{ children: 'children' }"
        v-loading="loading"
      >
        <el-table-column prop="name" label="部门名称" min-width="150" />
        <el-table-column prop="code" label="部门编码" width="120" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="user_count" label="人数" width="80" align="center" />
        <el-table-column prop="sort_order" label="排序" width="80" align="center" />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="primary" link @click="handleAddSub(row)">添加子部门</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 部门表单对话框 -->
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
        <el-form-item label="部门名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入部门名称" />
        </el-form-item>
        <el-form-item label="部门编码" prop="code">
          <el-input v-model="form.code" placeholder="请输入部门编码" :disabled="isEdit" />
        </el-form-item>
        <el-form-item label="上级部门">
          <el-tree-select
            v-model="form.parent_id"
            :data="departmentOptions"
            :props="{ label: 'name', value: 'id' }"
            placeholder="请选择上级部门"
            clearable
            check-strictly
            :disabled="isEdit && form.parent_id === null"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            rows="3"
            placeholder="请输入部门描述"
          />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" />
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment
} from '@/api/departments'

const loading = ref(false)
const submitLoading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref(null)
const departmentList = ref([])
const departmentTree = ref([])

const formRef = ref(null)
const form = reactive({
  name: '',
  code: '',
  parent_id: null,
  description: '',
  sort_order: 0,
  status: 1
})

const rules = {
  name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入部门编码', trigger: 'blur' }]
}

const dialogTitle = computed(() => isEdit.value ? '编辑部门' : '新增部门')

// 部门选择选项（排除当前编辑的部门及其子部门）
const departmentOptions = computed(() => {
  const filterTree = (list, excludeId) => {
    return list
      .filter(item => item.id !== excludeId)
      .map(item => ({
        ...item,
        children: item.children ? filterTree(item.children, excludeId) : []
      }))
  }
  return filterTree(departmentTree.value, currentId.value)
})

const fetchDepartments = async () => {
  loading.value = true
  try {
    const res = await getDepartments()
    departmentTree.value = res
    // 扁平化列表
    const flatten = (list) => {
      return list.reduce((acc, item) => {
        acc.push(item)
        if (item.children && item.children.length > 0) {
          acc.push(...flatten(item.children))
        }
        return acc
      }, [])
    }
    departmentList.value = flatten(res)
  } catch (error) {
    console.error('获取部门列表失败:', error)
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.name = ''
  form.code = ''
  form.parent_id = null
  form.description = ''
  form.sort_order = 0
  form.status = 1
  currentId.value = null
}

const handleAdd = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

const handleAddSub = (row) => {
  isEdit.value = false
  resetForm()
  form.parent_id = row.id
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  currentId.value = row.id
  form.name = row.name
  form.code = row.code
  form.parent_id = row.parent_id
  form.description = row.description
  form.sort_order = row.sort_order
  form.status = row.status
  dialogVisible.value = true
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除部门 "${row.name}" 吗？`,
      '提示',
      { type: 'warning' }
    )
    await deleteDepartment(row.id)
    ElMessage.success('删除成功')
    fetchDepartments()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除部门失败:', error)
    }
  }
}

const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    if (isEdit.value) {
      await updateDepartment(currentId.value, form)
      ElMessage.success('更新成功')
    } else {
      await createDepartment(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchDepartments()
  } catch (error) {
    console.error('保存部门失败:', error)
  } finally {
    submitLoading.value = false
  }
}

onMounted(() => {
  fetchDepartments()
})
</script>

<style scoped lang="scss">
.departments-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}
</style>
