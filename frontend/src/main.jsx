import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './App.css'

const inkTheme = {
  token: {
    colorPrimary: '#5a4e40',
    colorBgContainer: '#efe9e0',
    colorBgLayout: '#e0dbd2',
    colorBorder: 'rgba(90,75,55,0.3)',
    colorBorderSecondary: 'rgba(90,75,55,0.2)',
    borderRadius: 6,
    fontFamily: "'Songti SC','STSong','Noto Serif SC','Noto Serif','Georgia',serif",
    colorText: '#3a3530',
    colorTextSecondary: '#5a5545',
    colorBgElevated: '#efe9e0',
    colorPrimaryBg: 'rgba(90,75,55,0.1)',
    colorPrimaryBgHover: 'rgba(90,75,55,0.15)',
    colorPrimaryBorder: 'rgba(90,75,55,0.35)',
    colorPrimaryHover: '#4a4035',
    colorPrimaryActive: '#3a3530',
    colorLink: '#5a4e40',
    colorLinkHover: '#3a3530',
  },
  components: {
    Card: { borderRadiusLG: 8 },
    Table: {
      borderColor: 'rgba(90,75,55,0.2)',
      headerBg: '#e5ded4',
      headerColor: '#3a3530',
      rowHoverBg: 'rgba(90,75,55,0.06)',
    },
    Button: {
      primaryColor: '#efe9e0',
    },
    Tag: { borderRadiusSM: 4 },
    Segmented: {
      itemSelectedBg: '#e0d9ce',
      itemSelectedColor: '#3a3530',
    },
    Collapse: {
      headerBg: '#e8e3da',
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={inkTheme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
