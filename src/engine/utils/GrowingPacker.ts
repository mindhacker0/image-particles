/**
 *
 * 基于二叉树的装箱算法：以第一个块的尺寸为起点向右或向下扩展，
 * 为每个装箱成功的块写入带 `x` / `y` 的 `.fit` 节点。
 */

export interface PackerNode {
  x: number
  y: number
  w: number
  h: number
  used?: boolean
  down?: PackerNode
  right?: PackerNode
}

export interface PackerBlock {
  w: number
  h: number
  fit?: PackerNode | null
}

export class GrowingPacker {
  root: PackerNode = { x: 0, y: 0, w: 0, h: 0 }

  /** 对一组块执行装箱，结果写入各块的 `fit`。 */
  fit(blocks: PackerBlock[]): void {
    const len = blocks.length
    const w = len > 0 ? blocks[0].w : 0
    const h = len > 0 ? blocks[0].h : 0

    this.root = { x: 0, y: 0, w, h }

    for (let n = 0; n < len; n++) {
      const block = blocks[n]
      const node = this.findNode(this.root, block.w, block.h)

      if (node) {
        block.fit = this.splitNode(node, block.w, block.h)
      } else {
        block.fit = this.growNode(block.w, block.h)
      }
    }
  }

  /** 在子树中查找能容纳 w×h 的节点，找不到返回 null。 */
  findNode(root: PackerNode, w: number, h: number): PackerNode | null {
    if (root.used) {
      return this.findNode(root.right as PackerNode, w, h) || this.findNode(root.down as PackerNode, w, h)
    }

    if (w <= root.w && h <= root.h) {
      return root
    }

    return null
  }

  /** 标记节点已用，并切分出下方与右侧的剩余空间。 */
  splitNode(node: PackerNode, w: number, h: number): PackerNode {
    node.used = true
    node.down = { x: node.x, y: node.y + h, w: node.w, h: node.h - h }
    node.right = { x: node.x + w, y: node.y, w: node.w - w, h }
    return node
  }

  /** 空间不足时扩展根节点，优先保持接近正方形。 */
  growNode(w: number, h: number): PackerNode | null {
    const canGrowDown = w <= this.root.w
    const canGrowRight = h <= this.root.h

    // 尽量保持接近正方形：高度远大于宽度时向右扩展，宽度远大于高度时向下扩展
    const shouldGrowRight = canGrowRight && this.root.h >= this.root.w + w
    const shouldGrowDown = canGrowDown && this.root.w >= this.root.h + h

    if (shouldGrowRight) {
      return this.growRight(w, h)
    }

    if (shouldGrowDown) {
      return this.growDown(w, h)
    }

    if (canGrowRight) {
      return this.growRight(w, h)
    }

    if (canGrowDown) {
      return this.growDown(w, h)
    }

    // 根节点初始尺寸需合理，否则会走到这里
    return null
  }

  /** 向右扩展根节点后重新装箱。 */
  growRight(w: number, h: number): PackerNode | null {
    this.root = {
      used: true,
      x: 0,
      y: 0,
      w: this.root.w + w,
      h: this.root.h,
      down: this.root,
      right: { x: this.root.w, y: 0, w, h: this.root.h },
    }

    const node = this.findNode(this.root, w, h)
    return node ? this.splitNode(node, w, h) : null
  }

  /** 向下扩展根节点后重新装箱。 */
  growDown(w: number, h: number): PackerNode | null {
    this.root = {
      used: true,
      x: 0,
      y: 0,
      w: this.root.w,
      h: this.root.h + h,
      down: { x: 0, y: this.root.h, w: this.root.w, h },
      right: this.root,
    }

    const node = this.findNode(this.root, w, h)
    return node ? this.splitNode(node, w, h) : null
  }
}
