import axios from 'axios'
import { Notification, MessageBox, Message, Loading } from 'element-ui'
import store from '@/store'
import { getToken } from '@/utils/auth'
import errorCode from '@/utils/errorCode'
import { tansParams, blobValidate } from '@/utils/jri'
// import cache from '@/plugins/cache'
import { saveAs } from 'file-saver'
import { addPendingRequest, removePendingRequest } from './cancelRepeatRquest.js'
let downloadLoadingInstance
// 是否显示重新登录
export const isRelogin = { show: false }

axios.defaults.headers['Content-Type'] = 'application/json;charset=utf-8'
// 创建axios实例
const service = axios.create({
  // axios中请求配置有baseURL选项，表示请求URL公共部分
  baseURL: process.env.VUE_APP_BASE_API,
  // 超时
  timeout: 30000
})

// request拦截器
service.interceptors.request.use(config => {
  // 是否需要设置 token
  const isToken = (config.headers || {}).isToken === false
  // 是否需要防止数据重复提交
  // const isRepeatSubmit = (config.headers || {}).repeatSubmit === false
  if (getToken() && !isToken) {
    config.headers['Authorization'] = 'Bearer ' + getToken() // 让每个请求携带自定义token 请根据实际情况自行修改
  }
  // get请求映射params参数
  if (config.method === 'get' && config.params) {
    // 过滤空格
    Object.keys(config.params).forEach(item => {
      if (config.params[item] && typeof (config.params[item]) === 'string') {
        config.params[item] = config.params[item].replace(/(^\s*)|(\s*$)/g, '')
      }
    })
    let url = config.url + '?' + tansParams(config.params)
    url = url.slice(0, -1)
    config.params = {}
    config.url = url
  }
  // 防止重复请求
  // if (!isRepeatSubmit && (config.method === 'post' || config.method === 'put')) {
  //   const requestObj = {
  //     url: config.url,
  //     data: typeof config.data === 'object' ? JSON.stringify(config.data) : config.data,
  //     time: new Date().getTime(),
  //     method: config.method
  //   }
  //   const sessionObj = cache.session.getJSON('sessionObj')
  //   if (sessionObj === undefined || sessionObj === null || sessionObj === '') {
  //     cache.session.setJSON('sessionObj', requestObj)
  //   } else {
  //     const s_url = sessionObj.url // 请求地址
  //     const s_data = sessionObj.data // 请求数据
  //     const s_time = sessionObj.time // 请求时间
  //     const interval = 1000 // 间隔时间(ms)，小于此时间视为重复提交
  //     if (s_data === requestObj.data && requestObj.time - s_time < interval && s_url === requestObj.url) {
  //       const message = '数据正在处理，请勿重复提交'
  //       console.warn(`[${s_url}]: ` + message)
  //       return Promise.reject(new Error(message))
  //     } else {
  //       cache.session.setJSON('sessionObj', requestObj)
  //     }
  //   }
  // }
  if (config.method === 'post' || config.method === 'put') {
    // pendding 中的请求，后续请求不发送（由于存放的peddingMap 的key 和参数有关，所以放在参数处理之后）
    removePendingRequest(config)
    // 把当前请求信息添加到pendingRequest对象中
    addPendingRequest(config)
  }

  return config
}, error => {
  console.log('error', error)
  return Promise.reject(error)
})

// 响应拦截器
service.interceptors.response.use(res => {
  // 响应正常时候就从pendingRequest对象中移除请求
  removePendingRequest(res.config)
  // 未设置状态码则默认成功状态
  const code = res.data.code || 200
  // 获取错误信息
  const msg = errorCode[code] || res.data.msg || errorCode['default']
  // 二进制数据则直接返回
  if (res.request.responseType === 'blob' || res.request.responseType === 'arraybuffer') {
    return res.data
  }
  if (code === 401) {
    if (!isRelogin.show) {
      isRelogin.show = true
      MessageBox.confirm('登录状态已过期，您可以继续留在该页面，或者重新登录', '系统提示', {
        confirmButtonText: '重新登录',
        cancelButtonText: '取消',
        type: 'warning'
      }
      ).then(() => {
        isRelogin.show = false
        store.dispatch('LogOut').then(() => {
          location.href = '/#/login'// 少了#
        })
      }).catch(() => {
        isRelogin.show = false
      })
    }
    return Promise.reject('无效的会话，或者会话已过期，请重新登录。')
  } else if ((code === 500 && res.data.msg !== '验证码错误') && (code === 500 && res.data.msg !== '请重新获取验证码') && (code === 500 && res.data.msg !== '用户密码不在指定范围') && (code === 500 && res.data.msg !== '用户不存在/密码错误') && (code === 500 && res.data.msg !== '用户名或密码错误')) {
    Message({
      message: msg,
      type: 'error'
    })
    return Promise.reject(new Error(msg))
  } else if ((code !== 200 && res.data.msg !== '验证码错误') && (code !== 200 && res.data.msg !== '请重新获取验证码') && (code !== 200 && res.data.msg !== '用户密码不在指定范围') && (code !== 200 && res.data.msg !== '用户不存在/密码错误') && (code !== 200 && res.data.msg !== '用户名或密码错误')) {
    Notification.error({
      title: msg
    })
    return Promise.reject('error')
  } else {
    return res.data
  }
},
error => {
  // console.log('error', error)
  let { message } = error
  if (!error.__CANCEL__) {
    if (message === 'Network Error') {
      message = '后端接口连接异常'
    } else if (message.includes('timeout')) {
      message = '系统接口请求超时'
    } else if (message.includes('Request failed with status code')) {
      message = '系统接口' + message.substr(message.length - 3) + '异常'
    }
    Message({
      message: message,
      type: 'error',
      duration: 5 * 1000
    })
  }
  // 从pending 列表中移除请求
  removePendingRequest(error.config || {})
  // 触发这个错误处理
  if (axios.isCancel(error)) {
    // console.log('11', error)
    return Promise.reject(error)
  }
  return Promise.reject(error)
}
)

// 通用下载方法
export function download(url, params = {}, filename, type) {
  downloadLoadingInstance = Loading.service({ text: '正在下载数据，请稍候', spinner: 'el-icon-loading', background: 'rgba(0, 0, 0, 0.7)' })
  return service.post(url, params, {
    // transformRequest: [(params) => { return tansParams(params) }], // 此处不知为何需要做转换?将其注释
    // headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    headers: { 'Content-Type': 'application/json' },
    responseType: 'blob'
  }).then(async(data) => {
    const isLogin = await blobValidate(data)
    if (isLogin) {
      let blob = ''
      if (type === 'zip') {
        blob = new Blob([data], { type: 'application/zip' })
      } else {
        blob = new Blob([data])
      }
      saveAs(blob, filename)
    } else {
      const resText = await data.text()
      const rspObj = JSON.parse(resText)
      const errMsg = errorCode[rspObj.code] || rspObj.msg || errorCode['default']
      Message.error(errMsg)
    }
    downloadLoadingInstance.close()
  }).catch((r) => {
    console.error(r)
    // Message.error('下载文件出现错误，请联系管理员！')
    downloadLoadingInstance.close()
  })
}

export default service
