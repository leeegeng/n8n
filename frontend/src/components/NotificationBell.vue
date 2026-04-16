<template>
  <div class="notification-bell">
    <el-popover
      placement="bottom"
      :width="350"
      trigger="click"
      @show="handlePopoverShow"
    >
      <template #reference>
        <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="bell-badge">
          <el-icon :size="22" class="bell-icon" @click="fetchUnreadCount">
            <Bell />
          </el-icon>
        </el-badge>
      </template>

      <div class="notification-panel">
        <div class="panel-header">
          <span class="title">通知消息</span>
          <el-button v-if="notifications.length > 0" link type="primary" size="small" @click="handleMarkAllRead">
            全部已读
          </el-button>
        </div>

        <div class="notification-list" v-loading="loading">
          <div
            v-for="item in notifications"
            :key="item.id"
            class="notification-item"
            :class="{ unread: !item.is_read }"
            @click="handleNotificationClick(item)"
          >
            <div class="item-icon">
              <el-icon :size="18" :color="getIconColor(item.type)">
                <component :is="getIcon(item.type)" />
              </el-icon>
            </div>
            <div class="item-content">
              <div class="item-message">{{ item.message }}</div>
              <div class="item-time">{{ formatTime(item.created_at) }}</div>
            </div>
            <div v-if="!item.is_read" class="unread-dot"></div>
          </div>

          <el-empty v-if="notifications.length === 0" description="暂无通知" :image-size="60" />
        </div>

        <div class="panel-footer">
          <el-button text type="primary" size="small" @click="$router.push('/tasks')">
            查看全部待办
          </el-button>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, WarningFilled, CircleCheck, DocumentChecked } from '@element-plus/icons-vue'
import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from '@/api/notifications'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const router = useRouter()

const unreadCount = ref(0)
const notifications = ref([])
const loading = ref(false)
let refreshInterval = null

const getIcon = (type) => {
  const icons = {
    task: DocumentChecked,
    status: CircleCheck,
    error: WarningFilled
  }
  return icons[type] || Bell
}

const getIconColor = (type) => {
  const colors = {
    task: '#409EFF',
    status: '#67C23A',
    error: '#F56C6C'
  }
  return colors[type] || '#909399'
}

const formatTime = (time) => {
  return dayjs(time).fromNow()
}

const fetchUnreadCount = async () => {
  try {
    const res = await getUnreadCount()
    unreadCount.value = res.count
  } catch (error) {
    console.error('获取未读数量失败:', error)
  }
}

const fetchNotifications = async () => {
  loading.value = true
  try {
    const res = await getNotifications({ page: 1, pageSize: 10 })
    notifications.value = res
  } catch (error) {
    console.error('获取通知失败:', error)
  } finally {
    loading.value = false
  }
}

const handlePopoverShow = () => {
  fetchNotifications()
}

const handleNotificationClick = async (item) => {
  if (!item.is_read) {
    try {
      await markNotificationRead(item.id)
      item.is_read = 1
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch (error) {
      console.error('标记已读失败:', error)
    }
  }

  // 跳转到工单详情
  if (item.ticket_id) {
    router.push(`/tickets/detail/${item.ticket_id}`)
  }
}

const handleMarkAllRead = async () => {
  try {
    await markAllNotificationsRead()
    notifications.value.forEach(item => item.is_read = 1)
    unreadCount.value = 0
  } catch (error) {
    console.error('标记全部已读失败:', error)
  }
}

// 定时刷新未读数量
onMounted(() => {
  fetchUnreadCount()
  refreshInterval = setInterval(fetchUnreadCount, 30000) // 30秒刷新一次
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style scoped lang="scss">
.notification-bell {
  .bell-badge {
    cursor: pointer;
  }

  .bell-icon {
    color: #606266;
    transition: color 0.3s;

    &:hover {
      color: #409EFF;
    }
  }
}

.notification-panel {
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid #ebeef5;

    .title {
      font-weight: 500;
      font-size: 16px;
    }
  }

  .notification-list {
    max-height: 300px;
    overflow-y: auto;
    padding: 8px 0;

    .notification-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      cursor: pointer;
      border-radius: 4px;
      transition: background-color 0.3s;
      position: relative;

      &:hover {
        background-color: #f5f7fa;
      }

      &.unread {
        background-color: #f0f9ff;
      }

      .item-icon {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #f5f7fa;
        border-radius: 50%;
      }

      .item-content {
        flex: 1;
        min-width: 0;

        .item-message {
          font-size: 14px;
          color: #303133;
          line-height: 1.5;
          word-break: break-all;
        }

        .item-time {
          font-size: 12px;
          color: #909399;
          margin-top: 4px;
        }
      }

      .unread-dot {
        width: 8px;
        height: 8px;
        background-color: #f56c6c;
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: 6px;
      }
    }
  }

  .panel-footer {
    padding-top: 12px;
    border-top: 1px solid #ebeef5;
    text-align: center;
  }
}
</style>
