/**
 *
 * Binary tree based bin packing: grows right or down from the size of the first
 * block and marks every block that fits with a `.fit` node exposing `x` / `y`.
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

  findNode(root: PackerNode, w: number, h: number): PackerNode | null {
    if (root.used) {
      return this.findNode(root.right as PackerNode, w, h) || this.findNode(root.down as PackerNode, w, h)
    }

    if (w <= root.w && h <= root.h) {
      return root
    }

    return null
  }

  splitNode(node: PackerNode, w: number, h: number): PackerNode {
    node.used = true
    node.down = { x: node.x, y: node.y + h, w: node.w, h: node.h - h }
    node.right = { x: node.x + w, y: node.y, w: node.w - w, h }
    return node
  }

  growNode(w: number, h: number): PackerNode | null {
    const canGrowDown = w <= this.root.w
    const canGrowRight = h <= this.root.h

    // attempt to keep square-ish by growing right when height is much greater
    // than width, and down when width is much greater than height
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

    // need to ensure sensible root starting size to avoid this happening
    return null
  }

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
