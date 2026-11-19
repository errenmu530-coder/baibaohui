import { openPanel } from '@/state/ui';
import { currentFloorGuidance, setPendingFloorGuidance } from '@/autoTag/floorGuidance';
import { settings } from '@/state/settings';

const MENU_ITEM_ID = 'bbi-menu-item';
const GUIDE_ITEM_ID = 'bbi-floor-guidance-item';

/**
 * 往 ST 的 #extensionsMenu(魔杖菜单)末尾注入"柏宝绘"入口。
 * 菜单是懒加载的,用轮询等它出现;注入一次即可。
 */
export function injectMenuButton() {
  const tryInject = () => {
    const $menu = $('#extensionsMenu');
    if ($menu.length === 0) return false;
    if ($(`#${MENU_ITEM_ID}`).length > 0) return true;

    const $item = $(`
      <div class="extension_container interactable" tabindex="0">
        <a id="${MENU_ITEM_ID}" class="list-group-item" href="#" title="柏宝绘">
          <i class="fa-solid fa-palette"></i>
          <span>柏宝绘</span>
        </a>
      </div>
    `);

    $item.on('click', (e: { preventDefault: () => void }) => {
      e.preventDefault();
      openPanel();
      // 点击后收起魔杖菜单,贴合原生行为
      $('#extensionsMenu').hide();
    });

    $menu.append($item);
    const $guide = $(`
      <div class="extension_container interactable" tabindex="0">
        <a id="${GUIDE_ITEM_ID}" class="list-group-item" href="#" title="下一次整楼批量生图要求">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <span>柏宝绘 · 生图要求</span>
        </a>
      </div>
    `);
    $guide.on('click', (event: { preventDefault: () => void }) => {
      event.preventDefault();
      $('#extensionsMenu').hide();
      if (!settings.autoTag.floorGuidanceEnabled) {
        toastr.info('请先到柏宝绘「设置 → 自动生成 tag」开启魔法棒生图要求', '柏宝绘');
        return;
      }
      const answer = window.prompt('下一次整楼批量生图的共同要求（留空可清除）：', currentFloorGuidance());
      if (answer === null) return;
      if (!setPendingFloorGuidance(answer)) {
        toastr.warning('请先打开一个聊天', '柏宝绘');
        return;
      }
      toastr.info(answer.trim() ? '已记录，将用于下一次整楼批量生图' : '已清除生图要求', '柏宝绘');
    });
    $menu.append($guide);
    return true;
  };

  if (tryInject()) return;
  const timer = setInterval(() => {
    if (tryInject()) clearInterval(timer);
  }, 500);
}
