const fs = require('fs');
const path = require('path');

// 简单的 ICO 生成器，基于标准 ICO 格式
function generateICO(pngPath, outputPath) {
    try {
        const pngBuffer = fs.readFileSync(pngPath);

        // 创建一个简单的 ICO 文件结构
        // 这里我们创建一个包含 PNG 的基本 ICO 文件
        const icoHeader = Buffer.alloc(6);
        icoHeader.writeUInt16LE(0, 0); // Reserved
        icoHeader.writeUInt16LE(1, 2); // Type (1 = icon)
        icoHeader.writeUInt16LE(1, 4); // Image count

        // 图标目录项
        const iconDir = Buffer.alloc(16);
        const pngSize = pngBuffer.length;
        iconDir.writeUInt8(0, 0);   // Width (0 = 256px)
        iconDir.writeUInt8(0, 1);   // Height (0 = 256px)
        iconDir.writeUInt8(0, 2);   // Color palette (0 = no palette)
        iconDir.writeUInt8(0, 3);   // Reserved
        iconDir.writeUInt16LE(1, 4); // Color planes
        iconDir.writeUInt16LE(32, 6); // Bits per pixel
        iconDir.writeUInt32LE(pngSize, 8); // Image size
        iconDir.writeUInt32LE(22, 12); // Image offset (6 + 16 = 22)

        // 组合 ICO 文件
        const icoBuffer = Buffer.concat([icoHeader, iconDir, pngBuffer]);

        fs.writeFileSync(outputPath, icoBuffer);
        console.log(`✅ ICO 文件已生成: ${outputPath}`);
        return true;
    } catch (error) {
        console.error('❌ 生成 ICO 文件失败:', error);
        return false;
    }
}

// 生成图标文件
console.log('🎨 开始生成图标文件...');

const pngPath = 'build/icon.png';
const icoPath = 'build/icon.ico';
const icnsPath = 'build/icon.icns';

// 生成 ICO 文件
if (fs.existsSync(pngPath)) {
    generateICO(pngPath, icoPath);
} else {
    console.error('❌ 源 PNG 文件不存在:', pngPath);
}

console.log('✅ 图标生成完成！');