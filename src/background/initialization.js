import {storage, openURL} from 'src/helpers/chrome-api'
import checkUpdate from 'src/helpers/check-update'
import AppConfig from 'src/app-config'
import mergeConfig from './merge-config'
import setContextMenu from './set-context-menus'

chrome.runtime.onInstalled.addListener(onInstalled)
chrome.runtime.onStartup.addListener(onStartup)
chrome.notifications.onClicked.addListener(clickListener)
chrome.notifications.onButtonClicked.addListener(btnClickListener)

function onInstalled ({reason}) {
  clearHistory()
  mergeRecords('history')
  mergeRecords('notebook')
  // merge config on installed
  let isNew = false
  storage.sync.get('config', ({config}) => {
    if (config && config.dicts && config.dicts.all) {
      // got the correct version of config
      config = mergeConfig(config)
    } else {
      storage.local.clear()
      storage.sync.clear()
      config = new AppConfig()
      isNew = true
    }

    storage.sync.set({config})
      .then(() => {
        if (isNew) {
          openURL('https://github.com/crimx/crx-saladict/wiki')
        } else if (reason === 'update') {
          showNews()
        }
        setContextMenu(config)
      })
    storage.local.set({lastCheckUpdate: Date.now()})
  })
}

function onStartup () {
  // check update every month
  storage.local.get('lastCheckUpdate')
    .then(({lastCheckUpdate}) => {
      const today = Date.now()
      if (lastCheckUpdate && today - lastCheckUpdate < 30 * 24 * 60 * 60 * 1000) {
        return
      }
      checkUpdate().then(({info, isAvailable}) => {
        storage.local.set({lastCheckUpdate: today})
        if (isAvailable) {
          chrome.notifications.create('update', {
            requireInteraction: true,
            type: 'basic',
            iconUrl: chrome.runtime.getURL(`assets/icon-128.png`),
            title: '沙拉查词',
            message: (`可更新至【${info.tag_name}】`
            ),
            buttons: [{title: '查看更新'}]
          })
        }
      })
    })
}

function clickListener (id) {
  if (!/^(oninstall|update)$/.test(id)) { return }
  openURL('https://github.com/crimx/crx-saladict/wiki')
  chrome.notifications.getAll(notifications => {
    Object.keys(notifications).forEach(id => chrome.notifications.clear(id))
  })
}

function btnClickListener (id) {
  if (!/^(oninstall|update)$/.test(id)) { return }
  openURL('https://github.com/crimx/crx-saladict/releases')
  chrome.notifications.getAll(notifications => {
    Object.keys(notifications).forEach(id => chrome.notifications.clear(id))
  })
}

function showNews () {
  chrome.notifications.create('oninstall', {
    requireInteraction: true,
    type: 'basic',
    iconUrl: chrome.runtime.getURL(`assets/icon-128.png`),
    title: '沙拉查词 Saladict【5.29.1】',
    message: (`
      1. 单词记录同时保存来源，且可编辑
      2. 可自定义导出模板
      3. 扩大了容量（新权限申请）
      _. 本次更新在♫ King Of The North - Down to the Devil 伴随下完成
      `.trim().replace(/\s*\n\s*/g, '\n') // remove leading&tailing spaces of each line
    ),
    buttons: [{title: '查看更新'}]
  })
}

/**
 * Old version
 */
function clearHistory () {
  storage.local.get(['folderCatalog', 'collectionCatalog'])
    .then(({folderCatalog, collectionCatalog}) => {
      return storage.local.remove(
        ['folderCatalog', 'collectionCatalog']
          .concat(
            folderCatalog ? folderCatalog.data : [],
            collectionCatalog || []
          )
      )
    })
}

// ['historyCat', 'notebookCat']
function mergeRecords (area) {
  const catName = area + 'Cat'
  storage.local.get(catName)
    .then(response => {
      const catalog = response[catName]
      if (!catalog || catalog.version === 2) { return }
      storage.local.get(catalog.data)
        .then(allSet => {
          catalog.data.forEach((id, i) => {
            const recordSet = allSet[id]
            if (recordSet) {
              recordSet.data.forEach(records => {
                records.data = records.data.map(text => ({text}))
              })
              storage.local.set({[id]: recordSet})
            } else {
              catalog[i] = null
            }
          })
          catalog.version = 2
          catalog.data = catalog.data.filter(Boolean)
          storage.local.set({[catName]: catalog})
        })
    })
}