<template>
  <div class="workflow-designer">
    <el-card>
      <template #header>
        <div class="designer-header">
          <div class="header-left">
            <el-button @click="$router.back()">
              <el-icon><Back /></el-icon>
              返回
            </el-button>
            <span class="title">{{ workflowName }} - 流程设计</span>
          </div>
          <div class="header-right">
            <el-button-group>
              <el-button @click="handleZoomOut">
                <el-icon><ZoomOut /></el-icon>
              </el-button>
              <el-button @click="handleZoomIn">
                <el-icon><ZoomIn /></el-icon>
              </el-button>
              <el-button @click="handleFit">
                <el-icon><FullScreen /></el-icon>
                适应画布
              </el-button>
            </el-button-group>
            <el-button type="primary" @click="handleSave">
              <el-icon><Check /></el-icon>
              保存
            </el-button>
          </div>
        </div>
      </template>

      <div class="designer-container">
        <!-- 左侧节点面板 -->
        <div class="node-panel">
          <div class="panel-title">节点类型</div>
          <div class="node-list">
            <div
              v-for="node in nodeTypes"
              :key="node.type"
              class="node-item"
              @mousedown="startDrag($event, node)"
            >
              <el-icon :size="20"><component :is="node.icon" /></el-icon>
              <span>{{ node.label }}</span>
            </div>
          </div>
          <div class="panel-divider"></div>
          <div class="panel-title">操作说明</div>
          <div class="help-text">
            <p>• 拖拽节点到画布</p>
            <p>• 拖拽连接点连线</p>
            <p>• 滚轮缩放画布</p>
            <p>• 空格+拖拽平移</p>
            <p>• Delete删除选中</p>
          </div>
        </div>

        <!-- 中间画布 -->
        <div class="canvas-container" ref="canvasContainer">
          <div class="canvas" ref="canvas"></div>
        </div>

        <!-- 右侧属性面板 -->
        <div class="property-panel">
          <div class="panel-title">节点属性</div>
          <div v-if="selectedNode" class="property-form">
            <el-form label-width="80px">
              <el-form-item label="节点ID">
                <el-input v-model="selectedNode.id" disabled />
              </el-form-item>
              <el-form-item label="节点名称">
                <el-input v-model="selectedNode.data.name" @change="updateNodeName" />
              </el-form-item>
              <el-form-item label="节点类型">
                <el-tag>{{ getNodeTypeLabel(selectedNode.data.type) }}</el-tag>
              </el-form-item>

              <template v-if="selectedNode.data.type === 'task'">
                <el-divider>审批配置</el-divider>
                <el-form-item label="审批类型">
                  <el-radio-group v-model="selectedNode.data.config.taskType">
                    <el-radio :label="1">单人审批</el-radio>
                    <el-radio :label="2">会签（多人）</el-radio>
                  </el-radio-group>
                </el-form-item>

                <template v-if="selectedNode.data.config.taskType === 1">
                  <el-form-item label="指派类型">
                    <el-radio-group v-model="selectedNode.data.config.assigneeType">
                      <el-radio :label="1">指定用户</el-radio>
                      <el-radio :label="2">指定角色</el-radio>
                      <el-radio :label="3">指定部门</el-radio>
                    </el-radio-group>
                  </el-form-item>

                  <el-form-item label="指派人" v-if="selectedNode.data.config.assigneeType === 1">
                    <el-select
                      v-model="selectedNode.data.config.assigneeId"
                      placeholder="选择用户"
                      filterable
                      clearable
                    >
                      <el-option
                        v-for="user in userList"
                        :key="user.id"
                        :label="user.real_name || user.username"
                        :value="user.id"
                      />
                    </el-select>
                  </el-form-item>

                  <el-form-item label="指派角色" v-if="selectedNode.data.config.assigneeType === 2">
                    <el-select
                      v-model="selectedNode.data.config.assigneeId"
                      placeholder="选择角色"
                      clearable
                    >
                      <el-option
                        v-for="role in roleList"
                        :key="role.id"
                        :label="role.name"
                        :value="role.id"
                      />
                    </el-select>
                  </el-form-item>

                  <el-form-item label="指派部门" v-if="selectedNode.data.config.assigneeType === 3">
                    <el-tree-select
                      v-model="selectedNode.data.config.assigneeId"
                      :data="departmentList"
                      :props="{ label: 'name', value: 'id' }"
                      placeholder="选择部门"
                      clearable
                    />
                  </el-form-item>
                </template>

                <template v-if="selectedNode.data.config.taskType === 2">
                  <el-form-item label="会签人员">
                    <el-select
                      v-model="selectedNode.data.config.assignees"
                      multiple
                      placeholder="选择会签人员"
                      filterable
                    >
                      <el-option
                        v-for="user in userList"
                        :key="user.id"
                        :label="user.real_name || user.username"
                        :value="user.id"
                      />
                    </el-select>
                  </el-form-item>
                </template>

                <el-form-item label="驳回设置">
                  <el-checkbox v-model="selectedNode.data.config.allowReject">允许驳回</el-checkbox>
                </el-form-item>

                <el-form-item label="Webhook">
                  <el-checkbox v-model="selectedNode.data.config.allowWebhook">启用Webhook</el-checkbox>
                </el-form-item>

                <el-form-item label="Webhook URL" v-if="selectedNode.data.config.allowWebhook">
                  <el-input
                    v-model="selectedNode.data.config.webhookUrl"
                    placeholder="n8n webhook URL"
                  />
                </el-form-item>
              </template>

              <template v-if="selectedNode.data.type === 'condition'">
                <el-divider>条件配置</el-divider>
                <el-form-item label="条件表达式">
                  <el-input
                    v-model="selectedNode.data.config.condition"
                    type="textarea"
                    :rows="4"
                    placeholder="输入条件表达式，如: amount > 1000"
                  />
                </el-form-item>
                <el-alert type="info" :closable="false" show-icon>
                  <template #title>
                    支持变量：amount, priority, category 等表单字段
                  </template>
                </el-alert>
              </template>

              <template v-if="selectedNode.data.type === 'webhook'">
                <el-divider>Webhook配置</el-divider>
                <el-form-item label="请求方法">
                  <el-radio-group v-model="selectedNode.data.config.method">
                    <el-radio label="POST">POST</el-radio>
                    <el-radio label="GET">GET</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="请求URL">
                  <el-input
                    v-model="selectedNode.data.config.webhookUrl"
                    placeholder="https://n8n.example.com/webhook/..."
                  />
                </el-form-item>
                <el-form-item label="超时时间">
                  <el-input-number v-model="selectedNode.data.config.timeout" :min="1" :max="60" />
                  <span class="unit">秒</span>
                </el-form-item>
              </template>

              <el-divider />
              <el-button type="danger" @click="deleteSelectedNode" style="width: 100%">
                <el-icon><Delete /></el-icon>
                删除节点
              </el-button>
            </el-form>
          </div>
          <div v-else class="empty-tip">
            <el-empty description="请选择一个节点进行配置" />
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getWorkflow, updateWorkflow } from '@/api/workflows'
import { getDepartments } from '@/api/departments'
import { getUsers } from '@/api/users'
import { getRoles } from '@/api/roles'
import { Graph } from '@antv/x6'
import { Dnd } from '@antv/x6/es/plugin/dnd'
import '@antv/x6-vue-shape'

const route = useRoute()
const router = useRouter()
const workflowId = route.params.id

const workflowName = ref('')
const canvasContainer = ref(null)
const canvas = ref(null)
const graph = ref(null)
const selectedNode = ref(null)

const departmentList = ref([])
const userList = ref([])
const roleList = ref([])

// 节点类型定义
const nodeTypes = [
  { type: 'start', label: '开始节点', icon: 'CircleCheck', color: '#67c23a' },
  { type: 'task', label: '审批节点', icon: 'UserFilled', color: '#409eff' },
  { type: 'condition', label: '条件分支', icon: 'Share', color: '#e6a23c' },
  { type: 'webhook', label: 'Webhook', icon: 'Link', color: '#909399' },
  { type: 'end', label: '结束节点', icon: 'CircleClose', color: '#f56c6c' }
]

const getNodeTypeLabel = (type) => {
  const found = nodeTypes.find(n => n.type === type)
  return found ? found.label : type
}

// 初始化画布
const initGraph = (retryCount = 0) => {
  console.log(`initGraph 调用，重试次数: ${retryCount}, canvas: ${!!canvas.value}, container: ${!!canvasContainer.value}`)
  
  if (!canvas.value || !canvasContainer.value) {
    console.error('画布容器引用不存在')
    return
  }
  
  // 获取容器实际尺寸
  const rect = canvasContainer.value.getBoundingClientRect()
  const containerWidth = rect.width || 800
  const containerHeight = rect.height || 600
  
  console.log(`容器尺寸: ${containerWidth}x${containerHeight}`)
  
  // 如果尺寸为0，延迟重试（最多重试10次）
  if (containerWidth === 0 || containerHeight === 0) {
    if (retryCount < 10) {
      console.warn(`画布容器尺寸为0，第${retryCount + 1}次重试...`)
      setTimeout(() => {
        if (!graph.value) initGraph(retryCount + 1)
      }, 100)
    } else {
      console.error('画布容器尺寸获取失败，使用默认尺寸')
      initGraphWithSize(800, 600)
    }
    return
  }
  
  initGraphWithSize(containerWidth, containerHeight)
}

const initGraphWithSize = (width, height) => {
  graph.value = new Graph({
    container: canvas.value,
    width: width,
    height: height,
    background: {
      color: '#fafafa'
    },
    grid: {
      size: 10,
      visible: true,
      type: 'dot',
      args: {
        color: '#e0e0e0',
        thickness: 1
      }
    },
    panning: {
      enabled: true,
      eventTypes: ['leftMouseDown', 'mouseWheel']
    },
    mousewheel: {
      enabled: true,
      zoomAtMousePosition: true,
      modifiers: null,
      minScale: 0.5,
      maxScale: 3
    },
    connecting: {
      router: 'manhattan',
      connector: {
        name: 'rounded',
        args: {
          radius: 8
        }
      },
      anchor: 'center',
      connectionPoint: 'anchor',
      allowBlank: false,
      snap: {
        radius: 20
      },
      createEdge() {
        return graph.value.createEdge({
          shape: 'edge',
          attrs: {
            line: {
              stroke: '#999',
              strokeWidth: 2,
              targetMarker: {
                name: 'classic',
                size: 10
              }
            }
          }
        })
      },
      validateConnection({ sourceView, targetView, sourceMagnet, targetMagnet }) {
        if (sourceView === targetView) return false
        if (!sourceMagnet || !targetMagnet) return false
        return true
      }
    },
    highlighting: {
      magnetAdsorbed: {
        name: 'stroke',
        args: {
          attrs: {
            fill: '#5F95FF',
            stroke: '#5F95FF'
          }
        }
      }
    },
    selecting: {
      enabled: true,
      multiple: false,
      rubberband: false,
      showNodeSelectionBox: true
    },
    clipboard: {
      enabled: true
    },
    history: {
      enabled: true
    }
  })

  // 注册节点
  registerNodes()

  // 初始化 Dnd
  initDnd()

  // 事件监听
  graph.value.on('blank:click', () => {
    selectedNode.value = null
  })

  graph.value.on('cell:click', ({ cell }) => {
    if (cell.isNode()) {
      selectedNode.value = cell
    }
  })

  graph.value.on('node:change:data', ({ node }) => {
    if (selectedNode.value && selectedNode.value.id === node.id) {
      selectedNode.value = node
    }
  })

  // 键盘事件监听 - 使用原生事件
  const handleKeyDown = (e) => {
    // Delete 键删除选中节点
    if (e.key === 'Delete') {
      const cells = graph.value.getSelectedCells()
      if (cells.length) {
        graph.value.removeCells(cells)
        selectedNode.value = null
      }
    }
    // Ctrl+Z 撤销
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      graph.value.history.undo()
    }
    // Ctrl+Shift+Z 或 Ctrl+Y 重做
    if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
      e.preventDefault()
      graph.value.history.redo()
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  
  // 保存引用以便卸载时移除
  graph.value._keyHandler = handleKeyDown

  // 窗口大小调整
  window.addEventListener('resize', handleResize)
}

// 注册节点
const registerNodes = () => {
  // 开始节点
  Graph.registerNode('start', {
    inherit: 'rect',
    width: 120,
    height: 50,
    attrs: {
      body: {
        fill: '#67c23a',
        stroke: '#67c23a',
        rx: 25,
        ry: 25
      },
      label: {
        fill: '#fff',
        fontSize: 14,
        fontWeight: 'bold'
      }
    },
    ports: {
      groups: {
        out: {
          position: 'bottom',
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#67c23a',
              strokeWidth: 2,
              fill: '#fff'
            }
          }
        }
      },
      items: [{ group: 'out', id: 'out' }]
    }
  })

  // 结束节点
  Graph.registerNode('end', {
    inherit: 'rect',
    width: 120,
    height: 50,
    attrs: {
      body: {
        fill: '#f56c6c',
        stroke: '#f56c6c',
        rx: 25,
        ry: 25
      },
      label: {
        fill: '#fff',
        fontSize: 14,
        fontWeight: 'bold'
      }
    },
    ports: {
      groups: {
        in: {
          position: 'top',
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#f56c6c',
              strokeWidth: 2,
              fill: '#fff'
            }
          }
        }
      },
      items: [{ group: 'in', id: 'in' }]
    }
  })

  // 审批节点
  Graph.registerNode('task', {
    inherit: 'rect',
    width: 140,
    height: 60,
    attrs: {
      body: {
        fill: '#fff',
        stroke: '#409eff',
        strokeWidth: 2,
        rx: 4,
        ry: 4
      },
      label: {
        fill: '#333',
        fontSize: 13
      }
    },
    ports: {
      groups: {
        in: {
          position: 'top',
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#409eff',
              strokeWidth: 2,
              fill: '#fff'
            }
          }
        },
        out: {
          position: 'bottom',
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#409eff',
              strokeWidth: 2,
              fill: '#fff'
            }
          }
        }
      },
      items: [
        { group: 'in', id: 'in' },
        { group: 'out', id: 'out' }
      ]
    }
  })

  // 条件节点
  Graph.registerNode('condition', {
    inherit: 'polygon',
    width: 140,
    height: 70,
    attrs: {
      body: {
        fill: '#fff',
        stroke: '#e6a23c',
        strokeWidth: 2,
        refPoints: '0,10 70,0 140,10 70,20'
      },
      label: {
        fill: '#333',
        fontSize: 13
      }
    },
    ports: {
      groups: {
        in: {
          position: 'top',
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#e6a23c',
              strokeWidth: 2,
              fill: '#fff'
            }
          }
        },
        out: {
          position: 'bottom',
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#e6a23c',
              strokeWidth: 2,
              fill: '#fff'
            }
          }
        },
        outYes: {
          position: { name: 'absolute', args: { x: 20, y: 60 } },
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#67c23a',
              strokeWidth: 2,
              fill: '#fff'
            },
            text: { text: '是', fill: '#67c23a', fontSize: 10 }
          }
        },
        outNo: {
          position: { name: 'absolute', args: { x: 120, y: 60 } },
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#f56c6c',
              strokeWidth: 2,
              fill: '#fff'
            },
            text: { text: '否', fill: '#f56c6c', fontSize: 10 }
          }
        }
      },
      items: [
        { group: 'in', id: 'in' },
        { group: 'out', id: 'out' },
        { group: 'outYes', id: 'outYes' },
        { group: 'outNo', id: 'outNo' }
      ]
    }
  })

  // Webhook节点
  Graph.registerNode('webhook', {
    inherit: 'rect',
    width: 140,
    height: 60,
    attrs: {
      body: {
        fill: '#fff',
        stroke: '#909399',
        strokeWidth: 2,
        strokeDasharray: '5,5',
        rx: 4,
        ry: 4
      },
      label: {
        fill: '#333',
        fontSize: 13
      }
    },
    ports: {
      groups: {
        in: {
          position: 'top',
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#909399',
              strokeWidth: 2,
              fill: '#fff'
            }
          }
        },
        out: {
          position: 'bottom',
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#909399',
              strokeWidth: 2,
              fill: '#fff'
            }
          }
        }
      },
      items: [
        { group: 'in', id: 'in' },
        { group: 'out', id: 'out' }
      ]
    }
  })
}

// 开始拖拽 - 使用 X6 Dnd 插件
let dnd = null

const initDnd = () => {
  dnd = new Dnd({
    target: graph.value,
    scaled: false
  })
}

// 开始拖拽节点
const startDrag = (e, nodeType) => {
  if (!dnd) return

  const defaultConfig = {
    taskType: 1,
    assigneeType: 1,
    assigneeId: null,
    assignees: [],
    allowReject: true,
    allowWebhook: false,
    webhookUrl: '',
    condition: '',
    method: 'POST',
    timeout: 30
  }

  const node = graph.value.createNode({
    shape: nodeType.type,
    data: {
      type: nodeType.type,
      name: nodeType.label,
      config: { ...defaultConfig }
    },
    label: nodeType.label
  })

  dnd.start(node, e.originalEvent || e)
}

// 创建节点
const createNode = (type, x, y) => {
  const nodeType = nodeTypes.find(n => n.type === type)
  if (!nodeType) return

  const defaultConfig = {
    taskType: 1,
    assigneeType: 1,
    assigneeId: null,
    assignees: [],
    allowReject: true,
    allowWebhook: false,
    webhookUrl: '',
    condition: '',
    method: 'POST',
    timeout: 30
  }

  const node = graph.value.addNode({
    shape: type,
    x: x - 70,
    y: y - 30,
    data: {
      type: type,
      name: nodeType.label,
      config: { ...defaultConfig }
    },
    label: nodeType.label
  })

  return node
}

// 更新节点名称
const updateNodeName = () => {
  if (selectedNode.value) {
    selectedNode.value.setLabel(selectedNode.value.data.name)
  }
}

// 删除选中节点
const deleteSelectedNode = async () => {
  if (!selectedNode.value) return

  try {
    await ElMessageBox.confirm('确定要删除该节点吗？', '提示', {
      type: 'warning'
    })
    graph.value.removeCell(selectedNode.value)
    selectedNode.value = null
  } catch {
    // 取消删除
  }
}

// 缩放控制
const handleZoomIn = () => {
  graph.value.zoom(0.2)
}

const handleZoomOut = () => {
  graph.value.zoom(-0.2)
}

const handleFit = () => {
  graph.value.zoomToFit({ padding: 50 })
}

// 窗口大小调整
const handleResize = () => {
  if (graph.value && canvasContainer.value) {
    const rect = canvasContainer.value.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      graph.value.resize(rect.width, rect.height)
    }
  }
}

// 保存流程
const handleSave = async () => {
  try {
    const nodes = graph.value.getNodes().map(node => ({
      id: node.id,
      type: node.data.type,
      name: node.data.name,
      x: node.position().x,
      y: node.position().y,
      config: node.data.config
    }))

    const edges = graph.value.getEdges().map(edge => ({
      source: edge.getSourceCellId(),
      target: edge.getTargetCellId(),
      sourcePort: edge.getSourcePortId(),
      targetPort: edge.getTargetPortId()
    }))

    await updateWorkflow(workflowId, {
      definition: { nodes, edges }
    })
    ElMessage.success('保存成功')
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败')
  }
}

// 加载流程数据
const loadWorkflow = async () => {
  try {
    const res = await getWorkflow(workflowId)
    workflowName.value = res.name

    if (!graph.value) {
      console.warn('画布未初始化，跳过加载流程数据')
      return
    }

    // 清空画布
    graph.value.clearCells()

    const { nodes = [], edges = [] } = res.definition || {}

    // 添加节点
    const nodeMap = {}
    nodes.forEach(nodeData => {
      const node = graph.value.addNode({
        shape: nodeData.type,
        x: nodeData.x,
        y: nodeData.y,
        id: nodeData.id,
        data: {
          type: nodeData.type,
          name: nodeData.name,
          config: nodeData.config || {}
        },
        label: nodeData.name
      })
      nodeMap[nodeData.id] = node
    })

    // 如果没有节点，创建默认的开始和结束节点
    if (nodes.length === 0) {
      const startNode = createNode('start', 100, 50)
      const endNode = createNode('end', 100, 400)
      graph.value.addEdge({
        source: { cell: startNode.id, port: 'out' },
        target: { cell: endNode.id, port: 'in' },
        attrs: {
          line: {
            stroke: '#999',
            strokeWidth: 2,
            targetMarker: { name: 'classic', size: 10 }
          }
        }
      })
    }

    // 添加连线
    edges.forEach(edgeData => {
      if (nodeMap[edgeData.source] && nodeMap[edgeData.target]) {
        graph.value.addEdge({
          source: { cell: edgeData.source, port: edgeData.sourcePort || 'out' },
          target: { cell: edgeData.target, port: edgeData.targetPort || 'in' },
          attrs: {
            line: {
              stroke: '#999',
              strokeWidth: 2,
              targetMarker: { name: 'classic', size: 10 }
            }
          }
        })
      }
    })

    // 适应画布
    handleFit()
      
    // 设置初始缩放为 1（100%）
    graph.value.zoomTo(1)
  } catch (error) {
    console.error('加载流程失败:', error)
    ElMessage.error('加载流程失败')
  }
}

// 加载基础数据
const loadBaseData = async () => {
  try {
    const [deptRes, userRes, roleRes] = await Promise.all([
      getDepartments(),
      getUsers({ page: 1, pageSize: 1000 }),
      getRoles()
    ])
    departmentList.value = deptRes
    userList.value = userRes.list
    roleList.value = roleRes
  } catch (error) {
    console.error('加载基础数据失败:', error)
  }
}

// 清理画布实例
const cleanupGraph = () => {
  console.log('cleanupGraph 调用')
  window.removeEventListener('resize', handleResize)
  if (graph.value) {
    // 移除键盘事件监听
    if (graph.value._keyHandler) {
      document.removeEventListener('keydown', graph.value._keyHandler)
    }
    try {
      graph.value.dispose()
    } catch (e) {
      console.warn('清理画布实例失败:', e)
    }
    graph.value = null
  }
  if (dnd) {
    try {
      dnd.dispose()
    } catch (e) {
      console.warn('清理Dnd实例失败:', e)
    }
    dnd = null
  }
  selectedNode.value = null
  
  // 注销已注册的节点，避免重复注册错误
  try {
    Graph.unregisterNode('start')
    Graph.unregisterNode('end')
    Graph.unregisterNode('task')
    Graph.unregisterNode('condition')
    Graph.unregisterNode('webhook')
  } catch (e) {
    // 忽略未注册的错误
  }
}

const doInit = async () => {
  console.log('doInit 调用')
  
  // 先清理可能存在的旧实例
  cleanupGraph()
  
  // 等待 DOM 渲染完成
  await nextTick()
  
  // 再等待一帧，确保浏览器完成渲染
  await new Promise(resolve => requestAnimationFrame(resolve))
  await new Promise(resolve => requestAnimationFrame(resolve))
  
  console.log('DOM 渲染完成，开始初始化画布')
  
  // 初始化画布
  initGraph()
  
  // 等待画布初始化完成（包括可能的尺寸重试）
  const waitForGraph = setInterval(() => {
    if (graph.value) {
      console.log('画布初始化完成，开始加载数据')
      clearInterval(waitForGraph)
      loadBaseData()
      loadWorkflow()
    }
  }, 50)
  
  // 5秒后停止检查
  setTimeout(() => clearInterval(waitForGraph), 5000)
}

onMounted(doInit)

onUnmounted(() => {
  cleanupGraph()
})
</script>

<style scoped lang="scss">
.workflow-designer {
  .designer-header {
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

    .header-right {
      display: flex;
      gap: 12px;
    }
  }

  .designer-container {
    display: flex;
    height: calc(100vh - 250px);
    border: 1px solid #ebeef5;
    border-radius: 4px;
    overflow: hidden;
  }

  .node-panel {
    width: 200px;
    border-right: 1px solid #ebeef5;
    background: #f5f7fa;
    display: flex;
    flex-direction: column;

    .panel-title {
      padding: 12px 16px;
      font-weight: 500;
      border-bottom: 1px solid #ebeef5;
      background: #fff;
    }

    .panel-divider {
      height: 1px;
      background: #ebeef5;
      margin: 8px 0;
    }

    .node-list {
      padding: 12px;
    }

    .node-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      margin-bottom: 8px;
      background: #fff;
      border-radius: 4px;
      cursor: move;
      transition: all 0.3s;
      border: 1px solid #e0e0e0;

      &:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        border-color: #409eff;
      }

      &:active {
        cursor: grabbing;
      }
    }

    .help-text {
      padding: 12px;
      font-size: 12px;
      color: #666;
      line-height: 1.8;

      p {
        margin: 0;
      }
    }
  }

  .canvas-container {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: #fafafa;
    min-width: 400px;
    min-height: 400px;

    .canvas {
      width: 100%;
      height: 100%;
      min-width: 400px;
      min-height: 400px;
    }
  }

  .property-panel {
    width: 320px;
    border-left: 1px solid #ebeef5;
    background: #f5f7fa;
    display: flex;
    flex-direction: column;
    overflow-y: auto;

    .panel-title {
      padding: 12px 16px;
      font-weight: 500;
      border-bottom: 1px solid #ebeef5;
      background: #fff;
    }

    .property-form {
      padding: 16px;

      :deep(.el-form-item) {
        margin-bottom: 16px;
      }

      :deep(.el-divider) {
        margin: 16px 0;
      }

      .unit {
        margin-left: 8px;
        color: #666;
      }
    }

    .empty-tip {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
}

// X6 样式覆盖
:deep(.x6-graph) {
  .x6-node-selected {
    .x6-node-body {
      filter: drop-shadow(0 0 6px rgba(64, 158, 255, 0.6));
    }
  }

  .x6-edge:hover {
    path:nth-child(2) {
      stroke: #409eff;
      stroke-width: 3;
    }
  }

  .x6-edge-selected {
    path:nth-child(2) {
      stroke: #409eff;
      stroke-width: 3;
    }
  }
}
</style>
