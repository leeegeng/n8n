<template>
  <div class="create-ticket-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <el-button @click="$router.back()">
            <el-icon><Back /></el-icon>
            返回
          </el-button>
          <span>创建工单</span>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
        class="ticket-form"
      >
        <el-form-item label="选择流程" prop="workflowId">
          <el-select
            v-model="form.workflowId"
            placeholder="请选择审批流程"
            style="width: 100%"
            @change="handleWorkflowChange"
          >
            <el-option
              v-for="workflow in workflowList"
              :key="workflow.id"
              :label="workflow.name"
              :value="workflow.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="工单标题" prop="title">
          <el-input v-model="form.title" placeholder="请输入工单标题" />
        </el-form-item>

        <el-form-item label="优先级" prop="priority">
          <el-radio-group v-model="form.priority">
            <el-radio-button :label="1">低</el-radio-button>
            <el-radio-button :label="2">中</el-radio-button>
            <el-radio-button :label="3">高</el-radio-button>
            <el-radio-button :label="4">紧急</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="工单描述">
          <el-input
            v-model="form.description"
            type="textarea"
            rows="4"
            placeholder="请详细描述工单内容..."
          />
        </el-form-item>

        <!-- 动态表单字段 -->
        <template v-if="formSchema && formSchema.length > 0">
          <el-divider>表单信息</el-divider>
          <el-form-item
            v-for="field in formSchema"
            :key="field.name"
            :label="field.label"
            :prop="`formData.${field.name}`"
            :rules="field.required ? [{ required: true, message: `请输入${field.label}` }] : []"
          >
            <el-input
              v-if="field.type === 'text'"
              v-model="form.formData[field.name]"
              :placeholder="field.placeholder"
            />
            <el-input
              v-else-if="field.type === 'textarea'"
              v-model="form.formData[field.name]"
              type="textarea"
              :rows="field.rows || 3"
              :placeholder="field.placeholder"
            />
            <el-input-number
              v-else-if="field.type === 'number'"
              v-model="form.formData[field.name]"
              :placeholder="field.placeholder"
            />
            <el-select
              v-else-if="field.type === 'select'"
              v-model="form.formData[field.name]"
              :placeholder="field.placeholder"
              style="width: 100%"
            >
              <el-option
                v-for="opt in field.options"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-date-picker
              v-else-if="field.type === 'date'"
              v-model="form.formData[field.name]"
              type="date"
              :placeholder="field.placeholder"
              style="width: 100%"
            />
          </el-form-item>
        </template>

        <el-form-item>
          <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
            提交工单
          </el-button>
          <el-button @click="$router.back()">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getWorkflows } from '@/api/workflows'
import { createTicket } from '@/api/tickets'

const router = useRouter()
const formRef = ref(null)
const submitLoading = ref(false)
const workflowList = ref([])
const formSchema = ref([])

const form = reactive({
  workflowId: undefined,
  title: '',
  description: '',
  priority: 2,
  formData: {}
})

const rules = {
  workflowId: [{ required: true, message: '请选择流程', trigger: 'change' }],
  title: [{ required: true, message: '请输入工单标题', trigger: 'blur' }]
}

const fetchWorkflows = async () => {
  try {
    const res = await getWorkflows({ status: 1 })
    workflowList.value = res
  } catch (error) {
    console.error('获取流程列表失败:', error)
  }
}

const handleWorkflowChange = (workflowId) => {
  const workflow = workflowList.value.find(w => w.id === workflowId)
  console.log('选择的流程:', workflow)
  console.log('formSchema:', workflow?.formSchema)
  if (workflow && workflow.formSchema && Array.isArray(workflow.formSchema)) {
    formSchema.value = workflow.formSchema
    // 初始化表单数据
    form.formData = {}
    workflow.formSchema.forEach(field => {
      form.formData[field.name] = field.defaultValue || undefined
    })
  } else {
    formSchema.value = []
    form.formData = {}
  }
}

const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    await createTicket(form)
    ElMessage.success('工单创建成功')
    router.push('/tickets')
  } catch (error) {
    console.error('创建工单失败:', error)
  } finally {
    submitLoading.value = false
  }
}

onMounted(() => {
  fetchWorkflows()
})
</script>

<style scoped lang="scss">
.create-ticket-page {
  .card-header {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .ticket-form {
    max-width: 800px;
  }
}
</style>
