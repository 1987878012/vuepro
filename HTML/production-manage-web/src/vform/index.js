import axios from 'axios'

import VFormDesigner from '@/vform/components/form-designer/index.vue'
import VFormRender from '@/vform/components/form-render/index.vue'

import '@/vform/utils/directive'
import '@/vform/icons'
import '@/vform/iconfont/iconfont.css'

VFormDesigner.install = function (Vue) {
  Vue.component(VFormDesigner.name, VFormDesigner)
}

VFormRender.install = function (Vue) {
  Vue.component(VFormRender.name, VFormRender)
}

const components = [
  VFormDesigner,
  VFormRender
]

const install = (Vue) => {
  components.forEach(component => {
    Vue.component(component.name, component)
  })
}

if (typeof window !== 'undefined' && window.Vue) { /* script方式引入时主动调用install方法！！ */
  window.axios = axios
  install(window.Vue);
}

export default {
  install,
  VFormDesigner,
  VFormRender
}
