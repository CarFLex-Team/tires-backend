const multer = require("multer");

const uploadImage = multer({
    storage: multer.memoryStorage(),

    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            "image/png",
            "image/jpeg",
            "image/webp",
        ];

        const allowedExtensions = [
            "png",
            "jpg",
            "jpeg",
            "webp",
        ];

        const ext = file.originalname.split(".").pop().toLowerCase();

        if (
            !allowedMimeTypes.includes(file.mimetype) ||
            !allowedExtensions.includes(ext)
        ) {
            return cb(new Error("INVALID_FILE_TYPE"));
        }

        cb(null, true);
    },

    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
});

module.exports = uploadImage;