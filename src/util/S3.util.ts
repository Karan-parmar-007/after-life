import { 
    S3Client, 
    PutObjectCommand, 
    GetObjectCommand, 
    ListObjectsV2Command, 
    DeleteObjectCommand,
    ObjectCannedACL  
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage"; 
import dotenv from "dotenv";
dotenv.config();


const s3Client = new S3Client({
    forcePathStyle: false,
    endpoint: process.env.SPACE_OBJECT_STORAGE_ORIGIN_ENDPOINT,
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
        accessKeyId: process.env.SPACE_OBJECT_STORAGE_AIP_ACCESS_KEY || "",
        secretAccessKey: process.env.SPACE_OBJECT_STORAGE_AIP_SECRET_KEY || "",
    },
});
  

interface ImageData {
    base64Image: string;
    type: string;
    size: number;
}

type DeleteResponse = {
    data: string | null;
    error: string | null;
};

interface IS3UploadResponse {
    succesResponse: { Location: string; Key: string; ETag: string } | null; // Updated to reflect expected properties
    error: null | string;
}

const s3Uploader = async (
    avatar: { originalname: string; buffer: Buffer; mimetype: string },
    bucketName: string,
    userId?: string,
    relative?: string
): Promise<IS3UploadResponse> => {
    if (!avatar || !avatar.buffer) {
        return { succesResponse: null, error: "File buffer is missing." };
    }

    console.log("Access Key:", process.env.SPACE_OBJECT_STORAGE_AIP_ACCESS_KEY);
    console.log("Secret Key:", process.env.SPACE_OBJECT_STORAGE_AIP_SECRET_KEY ? "Loaded" : "Missing");
    console.log("Bucket Name:", process.env.S3_BUCKET_NAME);
    console.log("Endpoint:", process.env.SPACE_OBJECT_STORAGE_ORIGIN_ENDPOINT);
    console.log("Uploading file:", avatar.originalname, "Size:", avatar.buffer.length);

    let imageResponse: IS3UploadResponse = {
        succesResponse: null,
        error: null,
    };

    const uniqueFileName = userId
        ? `${userId}/${relative}/${Date.now()}_${avatar.originalname}`
        : `${Date.now()}_${avatar.originalname}`;

    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: bucketName,
            Key: uniqueFileName,
            Body: avatar.buffer,
            ContentType: avatar.mimetype,
            ACL: "public-read" as ObjectCannedACL,
        },
    });

    try {
        const result = await upload.done();
        const location = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`;
        imageResponse.succesResponse = {
            Location: location,
            Key: uniqueFileName,
            ETag: result.ETag || "", // ETag is always present in PutObject or CompleteMultipartUpload responses
        };
        console.log("Upload successful:", imageResponse.succesResponse);
    } catch (error) {
        console.error("Upload error:", error);
        imageResponse.error = (error as Error).message;
    }

    return imageResponse;
};


const getImageFromS3 = async (key: string, bucketName: string): Promise<ImageData | null> => { // Updated return type
    if (!key) {
        console.log("No key provided to getImageFromS3");
        return null;
    }

    const params = {
        Bucket: bucketName,
        Key: key,
    };

    try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { s3Client } = await import("../util/S3.util");
        const command = new GetObjectCommand(params);
        const data = await s3Client.send(command);

        if (!data.Body) {
            console.log("No data body found for the given key");
            return null;
        }

        const buffer = await data.Body.transformToByteArray();
        const base64Image = Buffer.from(buffer).toString("base64");
        const size = buffer.length; // Size in bytes
        const type = data.ContentType || 'application/octet-stream'; // Extract ContentType

        return { base64Image, type, size }; // Include all required properties
    } catch (error) {
        console.error("Error fetching image from S3:", error);
        return null;
    }
};


const getUserRelativeData = async (relativeId: string, user: string) => {
    const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: `${user}/${relativeId}`,
    };

    try {
        const command = new ListObjectsV2Command(params);
        const data = await s3Client.send(command);

        const files = await Promise.all(
            (data.Contents || []).map(async (file) => {
                const fileParams = {
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: file.Key!,
                };

                const fileData = await s3Client.send(new GetObjectCommand(fileParams));
                const buffer = fileData.Body ? await fileData.Body.transformToByteArray() : null;
                const base64Data = buffer ? Buffer.from(buffer).toString("base64") : null;

                return {
                    type: fileData.ContentType || "unknown",
                    key: file.Key,
                    size: file.Size,
                    lastModified: file.LastModified,
                    base64: base64Data,
                };
            })
        );

        return files;
    } catch (error) {
        console.error("Error retrieving files from Spaces:", error);
        throw new Error("Could not retrieve files from Spaces");
    }
};

const deleteFileFromS3 = async (bucketName: string, key: string): Promise<DeleteResponse> => {
    let deleteResponse: DeleteResponse = {
        data: null,
        error: null,
    };

    try {
        const params = { Bucket: bucketName, Key: key };
        await s3Client.send(new DeleteObjectCommand(params));
        deleteResponse.data = "File deleted";
    } catch (error) {
        console.error("Error deleting file:", error);
        deleteResponse.error = (error as Error).message;
    }

    return deleteResponse;
};


async function getFolderSize(bucketName: string, folderPath: string) {
    let check_size_response = { size: 0, error: null as string | null, content: 0 }; // Allow error to be string or null
    let continuationToken: string | undefined = undefined;

    try {
        do {
            const params: any = {
                Bucket: bucketName,
                Prefix: folderPath,
                ContinuationToken: continuationToken,
            };

            const command = new ListObjectsV2Command(params);
            const response = await s3Client.send(command);

            if (response.Contents) {
                for (const object of response.Contents) {
                    check_size_response.size += object.Size || 0;
                    check_size_response.content = response.Contents.length;
                }
            }

            continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
        } while (continuationToken);
    } catch (error) {
        check_size_response.error = (error as Error).message;
    }

    return check_size_response;
}

export { s3Uploader, s3Client, getImageFromS3, getUserRelativeData, deleteFileFromS3, getFolderSize };
